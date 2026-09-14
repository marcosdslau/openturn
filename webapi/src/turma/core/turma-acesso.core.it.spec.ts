/**
 * Integração do núcleo com Postgres real + equipamentos Control iD simulados em memória.
 *
 * Só roda com TURMA_IT_DATABASE_URL apontando para um banco DESCARTÁVEL com as migrations
 * aplicadas — o teste TRUNCA as tabelas. Sem a variável, é pulado.
 *
 *   TURMA_IT_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/turma_teste npx jest turma-acesso.core.it
 */
import { EQPEquipamento, PrismaClient } from '@prisma/client';
import { createControlIdAccessGroup } from '../../hardware/brands/controlid/access-group/controlid-access-group';
import { criarAccessGroupPort, criarLockEmMemoria } from './ports';
import { TurmaAcessoCore } from './turma-acesso.core';
import type { JanelaEntrada } from './tipos';

const URL = process.env.TURMA_IT_DATABASE_URL;
const descrever = URL ? describe : describe.skip;
jest.setTimeout(60_000);

type Linha = Record<string, any>;

function equipamentoFake(gruposPadrao: string[]) {
  let proximoId = 1000;
  const tabelas: Record<string, Linha[]> = {
    groups: gruposPadrao.map((name) => ({ id: proximoId++, name })),
    portals: [{ id: 1, name: 'Catraca' }],
    user_groups: [],
  };
  const semId = new Set(['group_access_rules', 'portal_access_rules', 'access_rule_time_zones', 'user_groups']);
  const casa = (l: Linha, w?: Linha) => !w || Object.entries(w).every(([k, v]) => String(l[k]) === String(v));
  const post = async (path: string, body: any) => {
    const t = (tabelas[body.object] ??= []);
    const filtro = body.where?.[body.object];
    switch (path) {
      case '/load_objects.fcgi':
        return { data: { [body.object]: t.filter((l) => casa(l, filtro)) } };
      case '/create_objects.fcgi':
        return {
          data: {
            ids: body.values.map((v: Linha) => {
              const linha = semId.has(body.object) ? { ...v } : { id: proximoId++, ...v };
              t.push(linha);
              return linha.id;
            }),
          },
        };
      case '/modify_objects.fcgi':
        t.filter((l) => casa(l, filtro)).forEach((l) => Object.assign(l, body.values));
        return { data: {} };
      case '/destroy_objects.fcgi':
        tabelas[body.object] = t.filter((l) => !casa(l, filtro));
        return { data: {} };
    }
    throw new Error(path);
  };
  const grupo = (nome: string) => tabelas.groups.find((g) => g.name === nome);
  return { tabelas, post, grupo };
}

const SEG_SEX = [false, true, true, true, true, true, false];
const MANHA: JanelaEntrada = { inicio: '06:30', fim: '12:30', dias: SEG_SEX };

descrever('TurmaAcessoCore — integração', () => {
  let prisma: PrismaClient;
  let core: TurmaAcessoCore;
  let ins: number;
  let usuario: number;
  let eqp: EQPEquipamento[];
  const devices = new Map<number, ReturnType<typeof equipamentoFake>>();
  const trm: Record<string, number> = {};
  const pes: Record<string, number> = {};
  const dev = (i: number) => devices.get(eqp[i].EQPCodigo)!;
  const status = (r: { resultados: Array<{ EQPCodigo: number; status: string }> }, i: number) =>
    r.resultados.filter((x) => x.EQPCodigo === eqp[i].EQPCodigo).map((x) => x.status);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "CLICliente", "USRUsuario" RESTART IDENTITY CASCADE');

    const cli = await prisma.cLICliente.create({ data: { CLINome: 'Escola IT' } });
    ins = (await prisma.iNSInstituicao.create({ data: { CLICodigo: cli.CLICodigo, INSNome: 'Escola IT' } })).INSCodigo;
    usuario = (await prisma.uSRUsuario.create({ data: { USRNome: 'Admin', USREmail: 'admin@it.local', USRSenha: 'x' } })).USRCodigo;

    eqp = [];
    for (const [nome, marca] of [
      ['A-Portaria', 'ControlID'],
      ['B-Pátio', 'ControlID'],
      ['C-Quadra', 'ControlID'],
      ['D-Serviço', 'ControlID'],
      ['E-Biblioteca', 'ControlID'],
      ['F-Refeitório', 'Hikvision'],
    ]) {
      eqp.push(await prisma.eQPEquipamento.create({ data: { EQPDescricao: nome, EQPMarca: marca, INSInstituicaoCodigo: ins } }));
    }
    eqp.forEach((e) => {
      if (e.EQPMarca === 'ControlID') devices.set(e.EQPCodigo, equipamentoFake(e.EQPDescricao === 'E-Biblioteca' ? [] : ['Student', 'Professor']));
    });

    for (const [nome, numero, turma] of [
      ['ana', '1001', '3º A'],
      ['bruno', '1002', '3º B'],
      ['carla', '1003', '3º C'],
    ]) {
      const p = await prisma.pESPessoa.create({ data: { PESNome: nome, PESGrupo: 'Student', INSInstituicaoCodigo: ins } });
      pes[nome] = p.PESCodigo;
      await prisma.mATMatricula.create({ data: { PESCodigo: p.PESCodigo, MATNumero: numero, MATTurma: turma, INSInstituicaoCodigo: ins } });
    }

    core = new TurmaAcessoCore(prisma, ins, {
      hardware: criarAccessGroupPort(async (e) => {
        if (e.EQPMarca !== 'ControlID') return { supportsAccessGroups: () => false };
        const ag = createControlIdAccessGroup(devices.get(e.EQPCodigo)!.post);
        return {
          supportsAccessGroups: () => true,
          syncAccessGroup: (_: number, g: any, r: any) => ag.sync(g, r),
          removeAccessGroup: (_: number, r: any) => ag.remove(r),
          countAccessGroupMembers: (_: number, r: any) => ag.countMembers(r),
          listAccessGroups: () => ag.list(),
        };
      }),
      lock: criarLockEmMemoria(),
      chaveLock: (i, e) => `it:${i}:${e}`,
      log: (nivel, msg) => { if (nivel !== "info") console.warn(msg); },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const catalogo2026 = {
    turmas: [
      { idExterno: 'c1', nome: '3º A', serie: '3ª série', curso: 'Médio', turno: 'matutino', anoReferencia: '2026' },
      { idExterno: 'c2', nome: '3º B', serie: '3ª série', curso: 'Médio', turno: 'matutino', anoReferencia: '2026' },
      { idExterno: 'c3', nome: '3º C', serie: '3ª série', curso: 'Médio', turno: 'vespertino', anoReferencia: '2026' },
    ],
    matriculasPorTurma: { c1: ['1001'], c2: ['1002'], c3: ['1003'] },
  };

  it('importa o catálogo, vincula matrículas por idEnrollment e é idempotente', async () => {
    const r = await core.importarCatalogo(catalogo2026);
    expect(r).toMatchObject({ criadas: 3, atualizadas: 0, desativadas: 0, matriculasSemTurma: 0, matriculasAmbiguas: 0 });

    for (const t of await prisma.tRMTurma.findMany({ where: { INSInstituicaoCodigo: ins } })) {
      trm[t.TRMTurma] = t.TRMCodigo;
      expect(t.TRMQtdePessoas).toBe(1);
    }

    const r2 = await core.importarCatalogo(catalogo2026);
    expect(r2).toMatchObject({ criadas: 0, atualizadas: 0, matriculasRevinculadas: 0 });
  });

  it('recusa catálogo vazio', async () => {
    await expect(core.importarCatalogo({ turmas: [], matriculasPorTurma: {} })).rejects.toThrow(/Catálogo vazio/);
  });

  it('preview sugere nome a partir do turno e valida regras', async () => {
    const p = await core.previewPerfil([MANHA], trm['3º A']);
    expect(p).toMatchObject({ erros: [], perfilExistente: null, nomeSugerido: 'MATUTINO-01' });

    const sobrepostas = [MANHA, { inicio: '12:00', fim: '13:00', dias: SEG_SEX }];
    await expect(
      core.salvarValidacao(trm['3º A'], { ativa: true, horarios: sobrepostas, escopo: { todos: true } }, { usuario }),
    ).rejects.toThrow(/Horário inválido/);

    await expect(
      core.salvarValidacao(trm['3º A'], { ativa: true, horarios: [MANHA], escopo: { todos: false, EQPCodigos: [eqp[5].EQPCodigo] } }, { usuario }),
    ).rejects.toThrow(/sem suporte/);
  });

  it('ativa a 3ª A em 3 equipamentos: cria perfil e aplica só no escopo', async () => {
    const r = await core.salvarValidacao(
      trm['3º A'],
      { ativa: true, horarios: [MANHA], escopo: { todos: false, EQPCodigos: [0, 1, 2].map((i) => eqp[i].EQPCodigo) } },
      { usuario },
    );
    expect(r.perfil).toMatchObject({ PHANome: 'MATUTINO-01', criado: true });
    expect([0, 1, 2].flatMap((i) => status(r, i))).toEqual(['aplicado', 'aplicado', 'aplicado']);
    expect(dev(0).grupo('MATUTINO-01')).toBeDefined();
    expect(dev(3).grupo('MATUTINO-01')).toBeUndefined();

    const t = await prisma.tRMTurma.findUniqueOrThrow({ where: { TRMCodigo: trm['3º A'] } });
    expect(t.USRCodigoAlteracao).toBe(usuario);
    expect(t.TRMAlteradoEm).not.toBeNull();
  });

  it('agrupa a 3ª B, com horário equivalente digitado de outro jeito, no mesmo perfil', async () => {
    const r = await core.salvarValidacao(
      trm['3º B'],
      {
        ativa: true,
        horarios: [
          { inicio: '06:30', fim: '09:00', dias: SEG_SEX },
          { inicio: '09:00', fim: '12:30', dias: SEG_SEX },
        ],
        escopo: { todos: false, EQPCodigos: [eqp[2].EQPCodigo, eqp[3].EQPCodigo] },
      },
      { usuario },
    );
    expect(r.perfil).toMatchObject({ PHANome: 'MATUTINO-01', criado: false });
    expect(status(r, 2)).toEqual(['sem_mudanca']);
    expect(status(r, 3)).toEqual(['aplicado']);
    expect(r.resultados.some((x) => x.status === 'erro')).toBe(false);
    expect(await prisma.pHAPerfilHorario.count({ where: { INSInstituicaoCodigo: ins } })).toBe(1);
  });

  it('vincula pessoas e resolve o departamento por equipamento', async () => {
    expect(await core.vincularPessoas()).toMatchObject({ alteradas: 2, conflitos: 0 });
    expect((await core.vincularPessoas()).alteradas).toBe(0);

    const codigos = eqp.map((e) => e.EQPCodigo);
    const ana = await core.gruposNoEquipamentos(pes.ana, codigos);
    expect(codigos.map((c) => ana[String(c)])).toEqual(['MATUTINO-01', 'MATUTINO-01', 'MATUTINO-01', 'Student', 'Student', 'Student']);
    const carla = await core.gruposNoEquipamentos(pes.carla, codigos);
    expect(new Set(Object.values(carla))).toEqual(new Set(['Student']));
  });

  it('tirar um equipamento do escopo invalida só os pares afetados e mantém o perfil onde outra turma usa', async () => {
    for (const i of [2, 3, 4]) {
      await prisma.pESEquipamentoMapeamento.create({
        data: { PESCodigo: pes.bruno, EQPCodigo: eqp[i].EQPCodigo, PEQIdNoEquipamento: '1002', PEQSyncHash: 'h', PEQSyncedAt: new Date() },
      });
    }

    // 3ª B: {C, D} → {D}
    const r = await core.salvarValidacao(
      trm['3º B'],
      { ativa: true, horarios: [MANHA], escopo: { todos: false, EQPCodigos: [eqp[3].EQPCodigo] } },
      { usuario },
    );
    expect(r.pessoasInvalidadas).toBe(1);
    const maps = await prisma.pESEquipamentoMapeamento.findMany({ where: { PESCodigo: pes.bruno }, orderBy: { EQPCodigo: 'asc' } });
    expect(maps.map((m) => m.PEQSyncHash)).toEqual([null, 'h', 'h']);
    expect(maps[0].PEQSyncedAt).toBeNull();
    expect(status(r, 2)).toEqual(['sem_mudanca']); // 3ª A ainda usa MATUTINO-01 na Quadra
  });

  it('desativar a 3ª A remove o perfil só onde ficou sem uso — e espera o grupo esvaziar no equipamento', async () => {
    dev(0).tabelas.user_groups.push({ user_id: 1001, group_id: dev(0).grupo('MATUTINO-01')!.id });

    const r = await core.salvarValidacao(trm['3º A'], { ativa: false, horarios: [], escopo: { todos: false } }, { usuario });
    expect(status(r, 0)).toEqual(['aguardando_membros']);
    expect(status(r, 1)).toEqual(['removido']);
    expect(status(r, 2)).toEqual(['removido']);
    expect(status(r, 3)).toEqual(['sem_mudanca']);
    expect(dev(0).grupo('MATUTINO-01')).toBeDefined();
    expect(dev(1).grupo('MATUTINO-01')).toBeUndefined();

    // desativar preserva perfil e escopo para reabrir a tela com a última configuração
    const t = await prisma.tRMTurma.findUniqueOrThrow({ where: { TRMCodigo: trm['3º A'] }, include: { escopo: true } });
    expect(t.PHACodigo).not.toBeNull();
    expect(t.escopo).toHaveLength(3);

    dev(0).tabelas.user_groups = [];
    const rc = await core.reconciliar();
    expect(status(rc, 0)).toEqual(['removido']);
    expect(dev(0).grupo('MATUTINO-01')).toBeUndefined();
    expect(rc.gruposPadraoAusentes).toEqual([
      expect.objectContaining({ EQPCodigo: eqp[4].EQPCodigo, faltando: ['Student'] }),
    ]);
  });

  it('renomeia o perfil no equipamento pelo id e valida o nome', async () => {
    const pha = (await prisma.pHAPerfilHorario.findFirstOrThrow({ where: { INSInstituicaoCodigo: ins } })).PHACodigo;
    const idAntes = dev(3).grupo('MATUTINO-01')!.id;

    const r = await core.renomearPerfil(pha, 'MANHA-A', { usuario });
    expect(status(r, 3)).toEqual(['aplicado']);
    expect(dev(3).grupo('MANHA-A')?.id).toBe(idAntes);

    await expect(core.renomearPerfil(pha, 'NOME-MUITO-LONGO-X', { usuario })).rejects.toThrow(/Máximo de 15/);
    await expect(core.renomearPerfil(pha, 'student', { usuario })).rejects.toThrow(/já está em uso/);
  });

  it('listagens refletem escopo, suporte e sincronismo', async () => {
    const lista = await core.listar({});
    const b = lista.data.find((t) => t.TRMCodigo === trm['3º B'])!;
    expect(b.perfil).toMatchObject({ PHANome: 'MANHA-A', qtdeTurmas: 1 });
    expect(b.sync).toMatchObject({ total: 1, sincronizados: 1, pendentes: 0, erros: 0 });

    const detalhe = await core.obter(trm['3º B']);
    expect(detalhe.equipamentos.filter((e) => e.noEscopo).map((e) => e.EQPCodigo)).toEqual([eqp[3].EQPCodigo]);
    expect(detalhe.equipamentos.find((e) => e.EQPMarca === 'Hikvision')?.suportado).toBe(false);

    const perfis = await core.listarPerfis();
    expect(perfis).toEqual([expect.objectContaining({ PHANome: 'MANHA-A', emUso: true, removendo: [] })]);

    expect((await core.opcoesFiltro()).turnos).toEqual(['matutino', 'vespertino']);
    expect((await core.listar({ equipamento: eqp[3].EQPCodigo })).data.map((t) => t.TRMCodigo)).toEqual([trm['3º B']]);
  });

  it('virada do ano: desativa turmas antigas, notifica, sugere e importa a configuração', async () => {
    const r = await core.importarCatalogo({
      turmas: [{ idExterno: 'n2', nome: '3º B', serie: '3ª série', curso: 'Médio', turno: 'matutino', anoReferencia: '2027' }],
      matriculasPorTurma: { n2: ['1002'] },
    });
    expect(r).toMatchObject({ criadas: 1, desativadas: 3 });
    expect(await prisma.nOTNotificacao.count({ where: { INSInstituicaoCodigo: ins, origem: 'turma_saida_origem' } })).toBe(1);

    const s = await core.sugestoesImportacaoAnoAnterior();
    expect(s.pares).toHaveLength(1);
    expect(s.pares[0].origem).toMatchObject({ TRMCodigo: trm['3º B'], PHANome: 'MANHA-A' });

    const imp = await core.importarAnoAnterior(
      [{ TRMCodigoOrigem: trm['3º B'], TRMCodigoDestino: s.pares[0].destino.TRMCodigo }],
      { usuario },
    );
    expect(imp).toMatchObject({ importadas: 1, falhas: [] });
    const nova = await prisma.tRMTurma.findUniqueOrThrow({ where: { TRMCodigo: s.pares[0].destino.TRMCodigo }, include: { escopo: true } });
    expect(nova.TRMValidacaoAtiva).toBe(true);
    expect(nova.escopo.map((e) => e.EQPCodigo)).toEqual([eqp[3].EQPCodigo]);
  });
});
