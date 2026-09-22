/**
 * Espelho da configuração de acesso do equipamento, contra Postgres real.
 *
 * Só roda com TURMA_IT_DATABASE_URL apontando para um banco DESCARTÁVEL com as migrations
 * aplicadas — o teste TRUNCA as tabelas. Sem a variável, é pulado.
 *
 *   TURMA_IT_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/turma_teste npx jest espelho.it --runInBand
 */
import { PrismaClient } from '@prisma/client';
import { aplicarSnapshot } from './espelho';
import type { HardwareAccessSnapshot } from './ports';

const URL = process.env.TURMA_IT_DATABASE_URL;
const descrever = URL ? describe : describe.skip;
jest.setTimeout(60_000);

const span = (start: number, end: number) => ({ start, end, dias: [0, 1, 1, 1, 1, 1, 0], feriados: [0, 0, 0] });

/** A catraca do runbook: duas áreas, dois portais de sentido, entrada e saída em horários distintos. */
function snapshotBase(): HardwareAccessSnapshot {
  return {
    areas: [
      { id: '3', nome: 'Área Interna' },
      { id: '4', nome: 'Área Externa' },
    ],
    portais: [
      { id: '3', nome: 'Entrada Área Interna', areaFromId: '4', areaToId: '3' },
      { id: '4', nome: 'Entrada Área Externa', areaFromId: '3', areaToId: '4' },
    ],
    horarios: [
      { id: '10', nome: 'catec manha', spans: [span(23400, 27000)] },
      { id: '11', nome: 'catec saida', spans: [span(41400, 45000)] },
    ],
    grupos: [{ id: '25', nome: 'Catec manha' }],
    regras: [
      { id: '18', nome: 'Entrada', tipo: 1, horarioIds: ['10'], portalIds: ['3'], grupoIds: ['25'] },
      { id: '19', nome: 'Saida', tipo: 1, horarioIds: ['11'], portalIds: ['4'], grupoIds: ['25'] },
    ],
  };
}

descrever('espelho — aplicarSnapshot', () => {
  let prisma: PrismaClient;
  let ins: number;
  let eqpCodigo: number;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "CLICliente", "USRUsuario" RESTART IDENTITY CASCADE');
    const cli = await prisma.cLICliente.create({ data: { CLINome: 'Escola espelho' } });
    ins = (await prisma.iNSInstituicao.create({ data: { CLICodigo: cli.CLICodigo, INSNome: 'Escola espelho' } })).INSCodigo;
    eqpCodigo = (
      await prisma.eQPEquipamento.create({
        data: { EQPDescricao: 'Portaria', EQPMarca: 'ControlID', INSInstituicaoCodigo: ins },
      })
    ).EQPCodigo;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const aplicar = (s: HardwareAccessSnapshot) => aplicarSnapshot(prisma, ins, eqpCodigo, s);

  it('grava áreas, portais, horários e intervalos na primeira leitura', async () => {
    const r = await aplicar(snapshotBase());

    expect(r.areas).toMatchObject({ criadas: 2, atualizadas: 0, removidas: 0 });
    expect(r.portais).toMatchObject({ criados: 2, removidos: 0 });
    expect(r.horarios).toMatchObject({ criados: 2, janelas: 2 });

    const interna = await prisma.aREArea.findFirst({ where: { EQPCodigo: eqpCodigo, AREIdDevice: '3' } });
    const portal = await prisma.pTLPortal.findFirst({ where: { EQPCodigo: eqpCodigo, PTLIdDevice: '3' } });
    expect(portal!.PTLAreaParaCodigo).toBe(interna!.ARECodigo);

    // Segundos preservados como o firmware guarda, sem arredondar para minuto.
    const janela = await prisma.hORJanela.findFirst({ where: { horario: { HORIdDevice: '10' } } });
    expect(janela).toMatchObject({ HRJInicioSeg: 23400, HRJFimSeg: 27000, HRJSeg: true, HRJDom: false });
  });

  it('é idempotente: reler o mesmo equipamento não duplica nada', async () => {
    await aplicar(snapshotBase());
    const segunda = await aplicar(snapshotBase());

    expect(segunda.areas).toMatchObject({ criadas: 0, atualizadas: 2, removidas: 0 });
    expect(await prisma.aREArea.count({ where: { EQPCodigo: eqpCodigo } })).toBe(2);
    expect(await prisma.pTLPortal.count({ where: { EQPCodigo: eqpCodigo } })).toBe(2);
    expect(await prisma.hORJanela.count()).toBe(2);
  });

  it('semeia o vínculo horário → área a partir das regras, e não o sobrescreve depois', async () => {
    const r = await aplicar(snapshotBase());
    expect(r.vinculosSemeados).toBe(2);

    // "catec manha" libera a ENTRADA na Área Interna (portal 3 → area_to 3).
    const entrada = await prisma.hORHorario.findFirst({
      where: { EQPCodigo: eqpCodigo, HORIdDevice: '10' },
      include: { areas: { include: { area: true } } },
    });
    expect(entrada!.areas.map((a) => a.area.AREIdDevice)).toEqual(['3']);

    // O operador tira o vínculo pela tela; uma releitura não pode trazê-lo de volta.
    await prisma.hRAHorarioArea.deleteMany({ where: { HORCodigo: entrada!.HORCodigo } });
    const segunda = await aplicar(snapshotBase());
    expect(segunda.vinculosSemeados).toBe(0);
    expect(await prisma.hRAHorarioArea.count({ where: { HORCodigo: entrada!.HORCodigo } })).toBe(0);
  });

  it('remove do espelho o objeto que sumiu do equipamento', async () => {
    await aplicar(snapshotBase());

    const sem11 = snapshotBase();
    sem11.horarios = sem11.horarios.filter((h) => h.id !== '11');
    sem11.regras = sem11.regras.filter((r) => r.id !== '19');
    const r = await aplicar(sem11);

    expect(r.horarios.removidos).toBe(1);
    expect(await prisma.hORHorario.count({ where: { EQPCodigo: eqpCodigo } })).toBe(1);
    expect(await prisma.hORJanela.count()).toBe(1);
  });

  it('não apaga o espelho quando o equipamento responde vazio', async () => {
    await aplicar(snapshotBase());

    const r = await aplicar({ areas: [], portais: [], horarios: [], grupos: [], regras: [] });

    expect(r.observacoes.leituraVazia).toBe(true);
    expect(r.areas.removidas).toBe(0);
    expect(await prisma.aREArea.count({ where: { EQPCodigo: eqpCodigo } })).toBe(2);
    expect(await prisma.hORHorario.count({ where: { EQPCodigo: eqpCodigo } })).toBe(2);
  });

  it('só espelha regras de departamento adotado, e conta o que o modelo não representa', async () => {
    const s = snapshotBase();
    s.regras.push(
      { id: '40', nome: 'Bloqueio', tipo: 0, horarioIds: ['10'], portalIds: ['3'], grupoIds: ['25'] },
      { id: '41', nome: 'Sempre Liberado', tipo: 1, horarioIds: [], portalIds: ['3'], grupoIds: ['25'] },
    );

    // Sem adoção, nenhum grupo vira departamento: adotar é decisão de gente.
    const antes = await aplicar(s);
    expect(antes.departamentos).toMatchObject({ adotados: 0, regras: 0 });
    expect(antes.gruposNaoAdotados).toEqual([{ id: '25', nome: 'Catec manha' }]);
    expect(await prisma.dRGDepartamentoRegra.count()).toBe(0);

    const dep = await prisma.dEPDepartamento.create({ data: { INSInstituicaoCodigo: ins, DEPNome: 'CATEC MANHA' } });
    await prisma.dEQDepartamentoEquipamento.create({
      data: {
        INSInstituicaoCodigo: ins,
        DEPCodigo: dep.DEPCodigo,
        EQPCodigo: eqpCodigo,
        DEQIdDevice: '25',
        DEQNome: 'nome antigo',
      },
    });

    const depois = await aplicar(s);
    expect(depois.departamentos).toMatchObject({ adotados: 1, regras: 2 });
    expect(depois.gruposNaoAdotados).toEqual([]);
    expect(depois.observacoes).toMatchObject({ bloqueios: 1, regrasSemHorario: 1 });

    const deq = await prisma.dEQDepartamentoEquipamento.findFirst({
      where: { EQPCodigo: eqpCodigo },
      include: { regras: { include: { areas: { include: { area: true } } }, orderBy: { DRGCodigo: 'asc' } } },
    });
    expect(deq!.DEQNome).toBe('Catec manha');
    expect(deq!.regras.map((r) => r.DRGIdRegraDevice).sort()).toEqual(['18', '19']);
    expect(deq!.regras.flatMap((r) => r.areas.map((a) => a.area.AREIdDevice)).sort()).toEqual(['3', '4']);
  });

  it('marca erro quando o departamento adotado some do equipamento, sem apagar a adoção', async () => {
    await aplicar(snapshotBase());
    const dep = await prisma.dEPDepartamento.create({ data: { INSInstituicaoCodigo: ins, DEPNome: 'CATEC MANHA' } });
    await prisma.dEQDepartamentoEquipamento.create({
      data: { INSInstituicaoCodigo: ins, DEPCodigo: dep.DEPCodigo, EQPCodigo: eqpCodigo, DEQIdDevice: '25', DEQNome: 'Catec manha' },
    });

    const semGrupo = snapshotBase();
    semGrupo.grupos = [];
    await aplicar(semGrupo);

    const deq = await prisma.dEQDepartamentoEquipamento.findFirst({ where: { EQPCodigo: eqpCodigo } });
    expect(deq).not.toBeNull();
    expect(deq!.DEQUltimoErro).toMatch(/não existe mais/);
  });
});
