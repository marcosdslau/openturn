/**
 * Integração do núcleo com Postgres real + equipamentos Control iD simulados em memória.
 *
 * Só roda com TURMA_IT_DATABASE_URL apontando para um banco DESCARTÁVEL com as migrations
 * aplicadas — o teste TRUNCA as tabelas. Sem a variável, é pulado.
 *
 *   TURMA_IT_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/turma_teste npx jest turma-acesso.core.it --runInBand
 */
import { EQPEquipamento, PrismaClient } from '@prisma/client';
import { createControlIdAccessGroup } from '../../hardware/brands/controlid/access-group/controlid-access-group';
import { canonizarRegras, hashJanelas } from './perfil-canonico';
import { criarAccessGroupPort, criarLockEmMemoria } from './ports';
import { TurmaAcessoCore } from './turma-acesso.core';
import type { JanelaEntrada, RegrasEntrada } from './tipos';

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
const faixa = (inicio: string, fim: string, dias = SEG_SEX): JanelaEntrada => ({ inicio, fim, dias });
/** Entrada livre, saída 17h–18h (exemplo da SpecControlId §5). */
const REGRAS_A: RegrasEntrada = { interna: { modo: 'livre' }, externa: { modo: 'horario', horarios: [faixa('17:00', '18:00')] } };

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
        const ag = createControlIdAccessGroup(d.post);
        return {
          supportsAccessGroups: () => true,
          prepareAccessDirection: async () => ({ ...(await ag.prepareDirection()), catra: d.catra }),
          readAccessDirection: async () => ({ ...(await ag.readDirection()), catra: d.catra }),
          syncAccessGroup: (_: number, g: any, r: any, p: any) => ag.sync(g, r, p),
          removeAccessGroup: (_: number, r: any) => ag.remove(r),
          countAccessGroupMembers: (_: number, r: any) => ag.countMembers(r),
          listAccessGroups: () => ag.list(),
          inspectAccessGroup: (_: number, r: any, n: string) => ag.inspect(r, n),
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

  it('preview por sentido: nome pelo turno, forma canônica e erro identificando o sentido', async () => {
    const p = await core.previewPerfil(REGRAS_A, trm['3º A']);
    expect(p).toMatchObject({ erros: [], nomeSugerido: 'MATUTINO-01', canonico: { interna: { modo: 'livre', dias: null } } });
    expect(p.canonico!.externa.dias![1]).toEqual([[1020, 1080]]);

    const ruim = await core.previewPerfil({ interna: { modo: 'livre' }, externa: { modo: 'horario', horarios: [faixa('07:00', '12:00'), faixa('11:00', '13:00')] } });
    expect(ruim.erros[0]).toMatch(/^Entrada na Área Externa: Faixas 1 e 2 se sobrepõem/);
  });

  it('não salva turma enquanto nenhum equipamento tiver as áreas preparadas', async () => {
    await expect(
      core.salvarValidacao(trm['3º A'], { ativa: true, regras: REGRAS_A, escopo: { todos: true } }, { usuario }),
    ).rejects.toThrow(/Nenhum equipamento tem a Área Interna e a Área Externa preparadas/);
  });

  it('prepara Área Interna/Externa por equipamento, replica regras gerais e alerta catra_default_fsm', async () => {
    for (const i of [0, 1, 2, 3, 4]) {
      const r = await core.prepararSentidoEquipamento(cod(i), { usuario });
      expect(r.sentido.preparado).toBe(true);
      expect(r.sentido.portais).toEqual({ interna: expect.any(String), externa: expect.any(String) });
      if (i === 1) expect(r.alertas[0]).toMatch(/catra_default_fsm = "1"/);
      else expect(r.alertas).toEqual([]);
    }
    const d0 = dev(0).tabelas;
    expect(d0.areas.map((a) => a.name).sort()).toEqual(['Área Externa', 'Área Interna']);
    expect(d0.portal_access_rules.filter((v) => v.access_rule_id === 1)).toHaveLength(3); // portal padrão + 2 de sentido

    await expect(core.prepararSentidoEquipamento(cod(5), { usuario })).rejects.toThrow(/sem suporte/);

    const lista = await core.listarEquipamentosSentido();
    expect(lista.filter((e) => e.sentido.preparado).map((e) => e.EQPDescricao)).toEqual([
      'A-Portaria',
      'B-Pátio',
      'C-Quadra',
      'D-Serviço',
      'E-Biblioteca',
    ]);

    // selecionar equipamento não preparado é recusado
    await expect(
      core.salvarValidacao(trm['3º A'], { ativa: true, regras: REGRAS_A, escopo: { todos: false, EQPCodigos: [cod(6)] } }, { usuario }),
    ).rejects.toThrow(/Prepare a Área Interna e a Área Externa antes de selecionar: G-Garagem/);
  });

  it('3ª A em 3 equipamentos: uma regra por sentido, cada uma só no portal do sentido', async () => {
    const r = await core.salvarValidacao(
      trm['3º A'],
      { ativa: true, regras: REGRAS_A, escopo: { todos: false, EQPCodigos: [cod(0), cod(1), cod(2)] } },
      { usuario },
    );
    expect(r.perfil).toMatchObject({ PHANome: 'MATUTINO-01', criado: true, regras: REGRAS_A });
    expect([0, 1, 2].flatMap((i) => status(r, i))).toEqual(['aplicado', 'aplicado', 'aplicado']);

    const sentido = await prisma.eQSEquipamentoSentido.findUniqueOrThrow({ where: { EQPCodigo: cod(0) } });
    const phe = await prisma.pHEPerfilEquipamento.findFirstOrThrow({ where: { EQPCodigo: cod(0) } });
    const portaisDaRegra = (id: string | null) =>
      dev(0).tabelas.portal_access_rules.filter((v) => String(v.access_rule_id) === id).map((v) => String(v.portal_id));
    expect(portaisDaRegra(phe.PHEIdRegraInterna)).toEqual([sentido.EQSPortalInternaId]);
    expect(portaisDaRegra(phe.PHEIdRegraExterna)).toEqual([sentido.EQSPortalExternaId]);
  });

  it('3ª B com a mesma regra digitada de outro jeito cai no mesmo perfil; 3ª C com entrada diferente não', async () => {
    const rB = await core.salvarValidacao(
      trm['3º B'],
      {
        ativa: true,
        regras: { interna: { modo: 'livre' }, externa: { modo: 'horario', horarios: [faixa('17:00', '17:30'), faixa('17:30', '18:00')] } },
        escopo: { todos: false, EQPCodigos: [cod(2), cod(3)] },
      },
      { usuario },
    );
    expect(rB.perfil).toMatchObject({ PHANome: 'MATUTINO-01', criado: false });
    expect(status(rB, 3)).toEqual(['aplicado']);

    const rC = await core.salvarValidacao(
      trm['3º C'],
      {
        ativa: true,
        regras: { interna: { modo: 'horario', horarios: [faixa('12:30', '13:30')] }, externa: { modo: 'livre' } },
        escopo: { todos: true },
      },
      { usuario },
    );
    expect(rC.perfil).toMatchObject({ PHANome: 'VESPERTINO-01', criado: true });
    expect(status(rC, 6)).toEqual(['sentido_nao_preparado']); // G-Garagem
    expect(status(rC, 5)).toEqual(['sentido_nao_preparado']); // Hikvision
    expect([0, 1, 2, 3, 4].flatMap((i) => status(rC, i))).toEqual(Array(5).fill('aplicado'));
  });

  it('vincula pessoas; equipamento sem áreas preparadas mantém o grupo padrão', async () => {
    expect(await core.vincularPessoas()).toMatchObject({ alteradas: 3, conflitos: 0 });
    const carla = await core.gruposNoEquipamentos(pes.carla, eqp.map((e) => e.EQPCodigo));
    expect(eqp.map((e) => carla[String(e.EQPCodigo)])).toEqual([
      'VESPERTINO-01',
      'VESPERTINO-01',
      'VESPERTINO-01',
      'VESPERTINO-01',
      'VESPERTINO-01',
      'Student',
      'Student',
    ]);

    const { data } = await core.listar({});
    expect(data.find((t) => t.TRMCodigo === trm['3º C'])!.sync).toMatchObject({
      total: 7,
      sincronizados: 5,
      naoSuportados: 1,
      semSentido: 1,
    });
  });

  it('lista as pessoas vinculadas à turma, com busca, sem excluídas e com a turma que define o acesso', async () => {
    const r = await core.listarPessoas(trm['3º C']);
    expect(r.turma).toMatchObject({ TRMCodigo: trm['3º C'], TRMQtdePessoas: 1 });
    expect(r.meta).toMatchObject({ total: 1, page: 1 });
    expect(r.data).toEqual([
      expect.objectContaining({
        PESCodigo: pes.carla,
        PESNome: 'carla',
        matriculas: ['1003'],
        turmaDeAcesso: { TRMCodigo: trm['3º C'], estaTurma: true, rotulo: expect.stringContaining('3º C') },
      }),
    ]);
    expect(r.data[0]).not.toHaveProperty('PESFotoBase64'); // só com comFoto

    expect((await core.listarPessoas(trm['3º C'], { busca: '1003' })).meta.total).toBe(1);
    expect((await core.listarPessoas(trm['3º C'], { busca: 'CAR' })).meta.total).toBe(1);
    expect((await core.listarPessoas(trm['3º C'], { busca: 'ana' })).meta.total).toBe(0);
    expect((await core.listarPessoas(trm['3º C'], { comFoto: true })).data[0]).toHaveProperty('PESFotoBase64', null);

    // pessoa em duas turmas: aparece nas duas, e o acesso segue a turma efetiva
    const extra = await prisma.mATMatricula.create({
      data: { PESCodigo: pes.carla, MATNumero: '2003', MATTurma: '3º A', TRMCodigo: trm['3º A'], INSInstituicaoCodigo: ins },
    });
    const na3A = await core.listarPessoas(trm['3º A']);
    expect(na3A.data.find((p) => p.PESCodigo === pes.carla)).toMatchObject({
      matriculas: ['2003'],
      turmaDeAcesso: { estaTurma: false, rotulo: expect.stringContaining('3º C') },
    });

    // excluída (soft delete) não aparece
    await prisma.pESPessoa.update({ where: { PESCodigo: pes.carla }, data: { deletedAt: new Date() } });
    expect((await core.listarPessoas(trm['3º A'])).data.some((p) => p.PESCodigo === pes.carla)).toBe(false);
    await prisma.pESPessoa.update({ where: { PESCodigo: pes.carla }, data: { deletedAt: null } });
    await prisma.mATMatricula.delete({ where: { MATCodigo: extra.MATCodigo } });

    await expect(core.listarPessoas(999999)).rejects.toThrow(/Turma não encontrada/);
  });

  it('tirar equipamento do escopo invalida só os pares afetados', async () => {
    for (const i of [2, 3]) {
      await prisma.pESEquipamentoMapeamento.create({
        data: { PESCodigo: pes.bruno, EQPCodigo: cod(i), PEQIdNoEquipamento: '1002', PEQSyncHash: 'h', PEQSyncedAt: new Date() },
      });
    }
    const r = await core.salvarValidacao(
      trm['3º B'],
      { ativa: true, regras: REGRAS_A, escopo: { todos: false, EQPCodigos: [cod(3)] } },
      { usuario },
    );
    expect(r.pessoasInvalidadas).toBe(1);
    expect(status(r, 2)).toEqual(['sem_mudanca']); // 3ª A ainda usa MATUTINO-01 na Quadra
  });

  it('lê do equipamento a regra aplicada, acusa adulteração e acompanha a inversão de portais', async () => {
    const ok = await core.lerRegraAplicada(trm['3º A'], cod(0));
    expect(ok.diferencas).toEqual([]);
    expect(ok.aplicado).toMatchObject({ interna: { modo: 'livre' }, externa: { modo: 'horario' } });
    expect(ok.aplicado!.externa.dias![1]).toEqual([[1020, 1080]]);

    // alguém muda a janela de saída direto no equipamento
    const phe = await prisma.pHEPerfilEquipamento.findFirstOrThrow({
      where: { EQPCodigo: cod(0), perfil: { PHANome: 'MATUTINO-01' } },
    });
    const span = dev(0).tabelas.time_spans.find((s) => String(s.time_zone_id) === phe.PHEIdHorarioExterna)!;
    span.end = 66600;
    const adulterado = await core.lerRegraAplicada(trm['3º A'], cod(0));
    expect(adulterado.diferencas).toEqual(['Entrada na Área Externa: os horários gravados no equipamento são diferentes dos configurados']);

    // teste em bancada mostrou portais trocados: inverter reaplica e a leitura volta a bater
    await prisma.pHEPerfilEquipamento.update({ where: { PHECodigo: phe.PHECodigo }, data: { PHESyncHash: null } });
    const inv = await core.atualizarSentidoEquipamento(cod(0), { invertido: true }, { usuario });
    expect(inv.sentido.invertido).toBe(true);
    expect(inv.resultados.every((x) => x.status === 'aplicado')).toBe(true);
    const sentido = await prisma.eQSEquipamentoSentido.findUniqueOrThrow({ where: { EQPCodigo: cod(0) } });
    const pheInv = await prisma.pHEPerfilEquipamento.findUniqueOrThrow({ where: { PHECodigo: phe.PHECodigo } });
    expect(
      dev(0).tabelas.portal_access_rules.filter((v) => String(v.access_rule_id) === pheInv.PHEIdRegraExterna).map((v) => String(v.portal_id)),
    ).toEqual([sentido.EQSPortalInternaId]);
    expect((await core.lerRegraAplicada(trm['3º A'], cod(0))).diferencas).toEqual([]);

    const val = await core.atualizarSentidoEquipamento(cod(0), { validado: true }, { usuario });
    expect(val.sentido.validadoEm).not.toBeNull();
  });

  it('desativar a 3ª A remove o perfil só onde ficou sem uso e com o grupo vazio', async () => {
    dev(0).tabelas.user_groups.push({ user_id: 1001, group_id: dev(0).grupo('MATUTINO-01')!.id });

    const r = await core.salvarValidacao(trm['3º A'], { ativa: false, escopo: { todos: false } }, { usuario });
    expect(status(r, 0)).toEqual(['aguardando_membros']);
    expect(status(r, 1)).toEqual(['removido']);
    expect(status(r, 2)).toEqual(['removido']);
    expect(status(r, 3)).toEqual(['sem_mudanca']);
    expect(dev(1).grupo('MATUTINO-01')).toBeUndefined();
    expect(dev(1).tabelas.time_zones.filter((t) => String(t.name).includes('MATUTINO'))).toEqual([]);

    dev(0).tabelas.user_groups = [];
    const rc = await core.reconciliar();
    expect(status(rc, 0).filter((s) => s !== 'sem_mudanca')).toEqual(['removido']);
    expect(rc.gruposPadraoAusentes.map((g) => g.EQPDescricao)).toEqual(expect.arrayContaining(['E-Biblioteca', 'G-Garagem']));
  });

  it('listagens trazem regras por sentido e forma canônica para o diagrama', async () => {
    // controle ativo primeiro (3º B, 3º C), depois o 3º A, que foi desativado — e não por nome
    const ordem = (await core.listar({})).data.map((t) => [t.TRMTurma, t.TRMValidacaoAtiva]);
    expect(ordem).toEqual([['3º B', true], ['3º C', true], ['3º A', false]]);

    const detalhe = await core.obter(trm['3º B']);
    expect(detalhe.regras).toEqual(REGRAS_A);
    expect(detalhe.canonico!.interna).toEqual({ modo: 'livre', dias: null });
    expect(detalhe.equipamentos.find((e) => e.EQPDescricao === 'G-Garagem')!.sentido.preparado).toBe(false);

    const perfis = await core.listarPerfis();
    const vesp = perfis.find((p) => p.PHANome === 'VESPERTINO-01')!;
    expect(vesp.regras.externa).toEqual({ modo: 'livre' });
    expect(vesp.equipamentos).toMatchObject({ total: 5, semSentido: 2 });
  });

  it('perfil legado (migração) é normalizado pela reconciliação', async () => {
    const perfil = await prisma.pHAPerfilHorario.findFirstOrThrow({ where: { PHANome: 'MATUTINO-01' }, include: { janelas: true } });
    await prisma.pHAPerfilHorario.update({ where: { PHACodigo: perfil.PHACodigo }, data: { PHAHashJanelas: `legado-${perfil.PHACodigo}` } });
    const rc = await core.reconciliar();
    expect(rc.perfisLegadosNormalizados).toBe(1);
    const depois = await prisma.pHAPerfilHorario.findUniqueOrThrow({ where: { PHACodigo: perfil.PHACodigo } });
    expect(depois.PHAHashJanelas).toBe(hashJanelas(canonizarRegras(REGRAS_A)));
  });

  it('virada do ano: sugere e importa as regras por sentido', async () => {
    const r = await core.importarCatalogo({
      turmas: [{ idExterno: 'n2', nome: '3º B', serie: '3ª série', curso: 'Médio', turno: 'matutino', anoReferencia: '2027' }],
      matriculasPorTurma: { n2: ['1002'] },
    });
    expect(r).toMatchObject({ criadas: 1, desativadas: 3 });

    const s = await core.sugestoesImportacaoAnoAnterior();
    expect(s.pares).toHaveLength(1);
    expect(s.pares[0].origem.regras).toEqual(REGRAS_A);

    const imp = await core.importarAnoAnterior(
      [{ TRMCodigoOrigem: trm['3º B'], TRMCodigoDestino: s.pares[0].destino.TRMCodigo }],
      { usuario },
    );
    expect(imp).toMatchObject({ importadas: 1, falhas: [] });
    const nova = await core.obter(s.pares[0].destino.TRMCodigo);
    expect(nova.regras).toEqual(REGRAS_A);
    expect(nova.escopo).toEqual({ todos: false, EQPCodigos: [cod(3)] });
  });

  it('busca sem resultado explica: turma só nas matrículas, fora do ERP ou catálogo desatualizado', async () => {
    // matrícula com turma que o catálogo do ERP não tem (o que a tela Matrículas mostra)
    await prisma.mATMatricula.create({ data: { PESCodigo: pes.ana, MATNumero: '1901', MATTurma: 'DC100', INSInstituicaoCodigo: ins } });

    const dc = await core.listar({ busca: 'dc100' });
    expect(dc.meta.total).toBe(0);
    expect(dc.semResultado).toMatchObject({ matriculas: 1, matriculasSemCatalogo: 1, turmasForaDoErp: 0, turmasNoCatalogo: 4 });
    expect(dc.semResultado!.catalogoAtualizadoEm).toBeInstanceOf(Date);

    // 3º A saiu do ERP na virada do ano: a busca padrão (só ativas) aponta isso
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
