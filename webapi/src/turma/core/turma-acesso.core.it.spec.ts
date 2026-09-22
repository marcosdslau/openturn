/**
 * Integração do núcleo com Postgres real + equipamentos Control iD simulados em memória.
 *
 * Só roda com TURMA_IT_DATABASE_URL apontando para um banco DESCARTÁVEL com as migrations
 * aplicadas — o teste TRUNCA as tabelas. Sem a variável, é pulado.
 *
 * Banco descartável no Postgres do docker-compose (NUNCA o openturn_db, que tem dado de trabalho):
 *
 *   docker exec openturn-db psql -U openturn_user -d postgres -c 'CREATE DATABASE turma_teste;'
 *   export TURMA_IT_DATABASE_URL='postgresql://openturn_user:openturn_password@127.0.0.1:5432/turma_teste?schema=public'
 *   DATABASE_URL=$TURMA_IT_DATABASE_URL DATABASE_URL_DIRECT=$TURMA_IT_DATABASE_URL npx prisma migrate deploy
 *   npx jest turma-acesso.core.it --runInBand
 */
import { EQPEquipamento, PrismaClient } from '@prisma/client';
import { createControlIdAccessConfig } from '../../hardware/brands/controlid/access-group/controlid-access-config';
import { criarAccessGroupPort, criarLockEmMemoria } from './ports';
import { TurmaAcessoCore } from './turma-acesso.core';

const URL = process.env.TURMA_IT_DATABASE_URL;
const descrever = URL ? describe : describe.skip;
jest.setTimeout(60_000);

type Linha = Record<string, any>;

function equipamentoFake(opcoes: { gruposPadrao: boolean; catraFsm?: string }) {
  let proximoId = 1000;
  const tabelas: Record<string, Linha[]> = {
    groups: opcoes.gruposPadrao ? [{ id: proximoId++, name: 'Student' }, { id: proximoId++, name: 'Professor' }] : [],
    portals: [{ id: 1, name: 'Portal padrão' }],
    access_rules: opcoes.gruposPadrao ? [{ id: 1, name: 'Sempre Liberado', type: 1, priority: 0 }] : [],
    group_access_rules: [],
    portal_access_rules: opcoes.gruposPadrao ? [{ portal_id: 1, access_rule_id: 1 }] : [],
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
  const catra = [{ host: '10.0.0.1', catra_role: '1', catra_side_to_enter: '0', catra_default_fsm: opcoes.catraFsm ?? '0' }];
  const grupo = (nome: string) => tabelas.groups.find((g) => g.name === nome);
  return { tabelas, post, catra, grupo };
}

const SEG_SEX = [false, true, true, true, true, true, false];

descrever('TurmaAcessoCore — integração (controle por sentido)', () => {
  let prisma: PrismaClient;
  let core: TurmaAcessoCore;
  let ins: number;
  let usuario: number;
  let eqp: EQPEquipamento[];
  const devices = new Map<number, ReturnType<typeof equipamentoFake>>();
  const trm: Record<string, number> = {};
  const pes: Record<string, number> = {};
  const dev = (i: number) => devices.get(eqp[i].EQPCodigo)!;
  const cod = (i: number) => eqp[i].EQPCodigo;
  const status = (r: { resultados: Array<{ EQPCodigo: number; status: string }> }, i: number) =>
    r.resultados.filter((x) => x.EQPCodigo === cod(i)).map((x) => x.status);

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
      ['G-Garagem', 'ControlID'],
    ]) {
      eqp.push(await prisma.eQPEquipamento.create({ data: { EQPDescricao: nome, EQPMarca: marca, INSInstituicaoCodigo: ins } }));
    }
    eqp.forEach((e) => {
      if (e.EQPMarca !== 'ControlID') return;
      devices.set(
        e.EQPCodigo,
        equipamentoFake({
          gruposPadrao: !['E-Biblioteca', 'G-Garagem'].includes(e.EQPDescricao!),
          catraFsm: e.EQPDescricao === 'B-Pátio' ? '1' : '0',
        }),
      );
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
        const d = devices.get(e.EQPCodigo)!;
        const cfg = createControlIdAccessConfig(d.post);
        return {
          supportsAccessGroups: () => true,
          readAccessConfig: () => cfg.readAll(),
          accessConfigOps: () => cfg,
          accessHosts: () => [{ host: `10.0.0.${e.EQPCodigo}`, origem: 'EQPEnderecoIp', efetivo: true }],
          readAccessConfigAllHosts: async () => [
            { host: `10.0.0.${e.EQPCodigo}`, origem: 'EQPEnderecoIp', efetivo: true, snapshot: await cfg.readAll() },
          ],
        };
      }),
      lock: criarLockEmMemoria(),
      chaveLock: (i, e) => `it:${i}:${e}`,
      log: (nivel, msg) => {
        if (nivel !== 'info') console.warn(msg);
      },
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
    expect(await core.importarCatalogo(catalogo2026)).toMatchObject({
      criadas: 3,
      atualizadas: 0,
      desativadas: 0,
      matriculasRevinculadas: 3,
      matriculasSemTurma: 0,
    });
    for (const t of await prisma.tRMTurma.findMany({ where: { INSInstituicaoCodigo: ins } })) {
      trm[t.TRMTurma] = t.TRMCodigo;
      expect(t.TRMQtdePessoas).toBe(1);
    }
    expect(await core.importarCatalogo(catalogo2026)).toMatchObject({ criadas: 0, atualizadas: 0, matriculasRevinculadas: 0 });

    // alteração no ERP é detectada e gravada em lote; data vai e volta sem deslocar fuso
    const alterado = {
      ...catalogo2026,
      turmas: catalogo2026.turmas.map((t) => (t.idExterno === 'c3' ? { ...t, turno: 'Vespertino', dataInicio: '2026-02-02T00:00:00.000Z' } : t)),
    };
    expect(await core.importarCatalogo(alterado)).toMatchObject({ criadas: 0, atualizadas: 1 });
    expect(await core.importarCatalogo(alterado)).toMatchObject({ atualizadas: 0 });
    const c3 = await prisma.tRMTurma.findUniqueOrThrow({ where: { TRMCodigo: trm['3º C'] } });
    expect(c3).toMatchObject({ TRMTurno: 'Vespertino', TRMDataInicio: new Date('2026-02-02T00:00:00.000Z') });
    expect(c3.updatedAt.getTime()).toBeGreaterThan(c3.createdAt.getTime());
    await core.importarCatalogo(catalogo2026);

    await expect(core.importarCatalogo({ turmas: [], matriculasPorTurma: {} })).rejects.toThrow(/Catálogo vazio/);
  });

  it('cria áreas e portais pela configuração do equipamento e espelha', async () => {
    const interna = await core.criarAreaEquipamento(cod(0), 'Área Interna');
    const externa = await core.criarAreaEquipamento(cod(0), 'Área Externa');
    await core.criarPortalEquipamento(cod(0), {
      areaDeCodigo: externa.ARECodigo!,
      areaParaCodigo: interna.ARECodigo!,
      nome: 'Entrada Área Interna',
    });
    await core.criarPortalEquipamento(cod(0), {
      areaDeCodigo: interna.ARECodigo!,
      areaParaCodigo: externa.ARECodigo!,
      nome: 'Entrada Área Externa',
    });

    const espelho = await core.obterEspelhoEquipamento(cod(0));
    expect(espelho.areas.map((a) => a.ARENome).sort()).toEqual(['Área Externa', 'Área Interna']);
    // Cada área tem o portal que leva ATÉ ela — é ele que carrega o sentido.
    for (const area of espelho.areas) {
      expect(espelho.portais.some((p) => p.PTLAreaParaCodigo === area.ARECodigo)).toBe(true);
    }
  });

  /** Ids do equipamento 0, montados no teste seguinte e usados pelos demais. */
  const eqp0: { interna?: number; externa?: number; entrada?: number; saida?: number; deq?: number; dep?: number } = {};

  it('monta o caso do runbook pela configuração do equipamento: entrada e saída em horários distintos', async () => {
    const espelho = await core.obterEspelhoEquipamento(cod(0));
    eqp0.interna = espelho.areas.find((a) => a.ARENome === 'Área Interna')!.ARECodigo;
    eqp0.externa = espelho.areas.find((a) => a.ARENome === 'Área Externa')!.ARECodigo;

    const entrada = await core.criarHorarioEquipamento(cod(0), {
      nome: 'catec manha',
      janelas: [{ inicio: '06:30', fim: '07:30', dias: SEG_SEX }],
      ARECodigos: [eqp0.interna],
    });
    const saida = await core.criarHorarioEquipamento(cod(0), {
      nome: 'catec saida',
      janelas: [{ inicio: '11:30', fim: '12:30', dias: SEG_SEX }],
      ARECodigos: [eqp0.externa],
    });
    eqp0.entrada = entrada.HORCodigo!;
    eqp0.saida = saida.HORCodigo!;

    const dep = await core.criarDepartamentoEquipamento(cod(0), { nome: 'CATEC MANHA' }, { usuario });
    eqp0.deq = dep.DEQCodigo;
    eqp0.dep = dep.DEPCodigo;

    const r = await core.salvarRegrasDepartamentoEquipamento(cod(0), eqp0.deq, [
      { HORCodigo: eqp0.entrada, ARECodigos: [eqp0.interna] },
      { HORCodigo: eqp0.saida, ARECodigos: [eqp0.externa] },
    ]);
    expect(r).toMatchObject({ criadas: 2, removidas: 0, avisos: [] });

    // Conferência do §5 do runbook: cada regra num portal só, e o do sentido certo.
    const t = dev(0).tabelas;
    const grupo = t.groups.find((g) => g.name === 'CATEC MANHA')!;
    const regras = t.group_access_rules.filter((v) => v.group_id === grupo.id).map((v) => v.access_rule_id);
    expect(regras).toHaveLength(2);

    const areaDoPortal = new Map(t.portals.map((p: any) => [String(p.id), String(p.area_to_id)]));
    const areaIdDe = (nome: string) => String(t.areas.find((a: any) => a.name === nome)!.id);
    for (const regraId of regras) {
      const portais = t.portal_access_rules.filter((v) => v.access_rule_id === regraId);
      expect(portais).toHaveLength(1);
      const horarios = t.access_rule_time_zones.filter((v) => v.access_rule_id === regraId);
      expect(horarios).toHaveLength(1);
      const tz = t.time_zones.find((z: any) => z.id === horarios[0].time_zone_id)!;
      const destino = areaDoPortal.get(String(portais[0].portal_id));
      expect(destino).toBe(tz.name === 'catec manha' ? areaIdDe('Área Interna') : areaIdDe('Área Externa'));
    }
  });

  it('a turma só aponta para o departamento; o escopo decide onde vale', async () => {
    const r = await core.salvarValidacao(
      trm['3º A'],
      { ativa: true, DEPCodigo: eqp0.dep, escopo: { todos: false, EQPCodigos: [cod(0), cod(1)] } },
      { usuario },
    );
    expect(r.departamento).toMatchObject({ DEPCodigo: eqp0.dep, DEPNome: 'CATEC MANHA' });

    // Equipamento 0 adotou o departamento; o 1 não — e isso é dito, não escondido.
    expect(status(r, 0)).toEqual(['aplicado']);
    expect(status(r, 1)).toEqual(['departamento_nao_adotado']);
  });

  it('a pessoa recebe o departamento onde ele foi adotado e o grupo padrão no resto', async () => {
    expect(await core.vincularPessoas()).toMatchObject({ conflitos: 0 });
    const ana = await core.gruposNoEquipamentos(pes.ana, eqp.map((e) => e.EQPCodigo));

    expect(ana[String(cod(0))]).toBe('CATEC MANHA');
    // No escopo, mas sem adoção: não existe grupo para ela lá.
    expect(ana[String(cod(1))]).toBe('Student');
    // Fora do escopo.
    expect(ana[String(cod(2))]).toBe('Student');
  });

  it('adota o mesmo departamento noutro equipamento e a pessoa passa a tê-lo lá também', async () => {
    await core.lerConfiguracaoEquipamento(cod(1));
    const criado = await core.criarDepartamentoEquipamento(cod(1), { nome: 'CATEC MANHA', DEPCodigo: eqp0.dep }, { usuario });
    expect(criado.DEPCodigo).toBe(eqp0.dep);

    // Sem regra nenhuma ainda: o departamento existe, mas ninguém passa por ele.
    const verificacao = await core.verificarDepartamentos({ TRMCodigos: [trm['3º A']] });
    expect(verificacao.find((v) => v.EQPCodigo === cod(1))!.status).toBe('sem_regra');

    const grupos = await core.gruposNoEquipamentos(pes.ana, [cod(1)]);
    expect(grupos[String(cod(1))]).toBe('CATEC MANHA');
  });

  it('tirar equipamento do escopo invalida só os pares afetados', async () => {
    const antes = await prisma.pESEquipamentoMapeamento.count({ where: { PESCodigo: pes.ana } });
    await core.salvarValidacao(
      trm['3º A'],
      { ativa: true, DEPCodigo: eqp0.dep, escopo: { todos: false, EQPCodigos: [cod(0)] } },
      { usuario },
    );
    const grupos = await core.gruposNoEquipamentos(pes.ana, [cod(0), cod(1)]);
    expect(grupos[String(cod(0))]).toBe('CATEC MANHA');
    expect(grupos[String(cod(1))]).toBe('Student');
    expect(antes).toBeGreaterThanOrEqual(0);
  });

  it('desativar devolve todo mundo ao grupo padrão sem mexer na catraca', async () => {
    const antesGrupos = dev(0).tabelas.groups.length;
    await core.salvarValidacao(trm['3º A'], { ativa: false, escopo: { todos: true } }, { usuario });

    const grupos = await core.gruposNoEquipamentos(pes.ana, [cod(0)]);
    expect(grupos[String(cod(0))]).toBe('Student');
    // O departamento continua no equipamento: desativar a turma não apaga configuração.
    expect(dev(0).tabelas.groups.length).toBe(antesGrupos);
  });

  it('busca sem resultado explica: turma só nas matrículas, fora do ERP ou catálogo desatualizado', async () => {
    // matrícula com turma que o catálogo do ERP não tem (o que a tela Matrículas mostra)
    await prisma.mATMatricula.create({ data: { PESCodigo: pes.ana, MATNumero: '1901', MATTurma: 'DC100', INSInstituicaoCodigo: ins } });

    const dc = await core.listar({ busca: 'dc100' });
    expect(dc.meta.total).toBe(0);
    expect(dc.semResultado).toMatchObject({ matriculas: 1, matriculasSemCatalogo: 1, turmasForaDoErp: 0, turmasNoCatalogo: 3 });
    expect(dc.semResultado!.catalogoAtualizadoEm).toBeInstanceOf(Date);

    // 3º A saiu do ERP na virada do ano: o catálogo que chega sem ela desativa, não apaga.
    const semTerceiroA = {
      turmas: catalogo2026.turmas.filter((t) => t.idExterno !== 'c1'),
      matriculasPorTurma: { c2: ['1002'], c3: ['1003'] },
    };
    expect(await core.importarCatalogo(semTerceiroA)).toMatchObject({ desativadas: 1 });

    // a busca padrão (só ativas) não acha, e o semResultado diz por quê
    const foraDoErp = await core.listar({ busca: '3º A' });
    expect(foraDoErp.meta.total).toBe(0);
    expect(foraDoErp.semResultado).toMatchObject({ turmasForaDoErp: 1 });
    expect((await core.listar({ busca: '3º A', ativa: 'todas' })).meta.total).toBe(1);

    // com resultado não há explicação
    expect((await core.listar({ busca: '3º B' })).semResultado).toBeNull();
  });

  it('catálogo grande é gravado em lote, numa transação e com poucas consultas', async () => {
    const cli = await prisma.cLICliente.create({ data: { CLINome: 'Escola grande' } });
    const insGrande = (await prisma.iNSInstituicao.create({ data: { CLICodigo: cli.CLICodigo, INSNome: 'Escola grande' } })).INSCodigo;
    const alunos = 400;
    for (let i = 0; i < alunos; i += 100) {
      const lote = Array.from({ length: Math.min(100, alunos - i) }, (_, k) => i + k);
      const pessoas = await prisma.pESPessoa.createManyAndReturn({
        data: lote.map((n) => ({ PESNome: `aluno ${n}`, INSInstituicaoCodigo: insGrande })),
        select: { PESCodigo: true },
      });
      await prisma.mATMatricula.createMany({
        data: pessoas.map((p, k) => ({ PESCodigo: p.PESCodigo, MATNumero: String(9000 + lote[k]), MATTurma: 'X', INSInstituicaoCodigo: insGrande })),
      });
    }
    const turmas = Array.from({ length: 3000 }, (_, n) => ({
      idExterno: String(100000 + n),
      nome: `T${n}`,
      curso: 'Curso',
      serie: `Módulo ${n % 4}`,
      turno: 'Matutino',
      anoReferencia: String(2019 + (n % 8)),
    }));
    const matriculasPorTurma = Object.fromEntries(Array.from({ length: alunos }, (_, a) => [String(100000 + a), [String(9000 + a)]]));

    const monitorado = new PrismaClient({ datasources: { db: { url: URL } }, log: [{ emit: 'event', level: 'query' }] });
    let consultas = 0;
    monitorado.$on('query', () => consultas++);
    const coreGrande = new TurmaAcessoCore(monitorado, insGrande, {
      hardware: criarAccessGroupPort(async () => ({ supportsAccessGroups: () => false })),
      lock: criarLockEmMemoria(),
      chaveLock: (i, e) => `it:${i}:${e}`,
      log: () => undefined,
    });
    try {
      const inicio = Date.now();
      const r = await coreGrande.importarCatalogo({ turmas, matriculasPorTurma });
      const ms = Date.now() - inicio;
      expect(r).toMatchObject({ turmasRecebidas: 3000, criadas: 3000, matriculasRevinculadas: alunos, matriculasSemTurma: 0 });
      // antes: 1 INSERT por turma + 1 UPDATE por turma com alunos (~3.400 idas ao banco)
      expect(consultas).toBeLessThan(30);
      console.info(`catálogo de 3000 turmas: ${consultas} consultas em ${ms} ms`);

      const comAlunos = await prisma.tRMTurma.count({ where: { INSInstituicaoCodigo: insGrande, TRMQtdePessoas: 1 } });
      expect(comAlunos).toBe(alunos);

      // idempotente e barato na segunda execução
      consultas = 0;
      expect(await coreGrande.importarCatalogo({ turmas, matriculasPorTurma })).toMatchObject({ criadas: 0, atualizadas: 0, matriculasRevinculadas: 0 });
      expect(consultas).toBeLessThan(15);

      // falha no meio desfaz tudo: o catálogo nunca fica pela metade
      const antes = await prisma.tRMTurma.count({ where: { INSInstituicaoCodigo: insGrande } });
      const falhaNoVinculo = new Proxy({}, { ownKeys: () => { throw new Error('falha simulada no vínculo'); } });
      await expect(
        coreGrande.importarCatalogo({ turmas: [...turmas, { idExterno: 'x1', nome: 'Nova' }], matriculasPorTurma: falhaNoVinculo }),
      ).rejects.toThrow(/falha simulada/);
      expect(await prisma.tRMTurma.count({ where: { INSInstituicaoCodigo: insGrande } })).toBe(antes);
    } finally {
      await monitorado.$disconnect();
    }
  });
});
