import { createControlIdAccessConfig } from './controlid-access-config';

type Linha = Record<string, any>;

/** Equipamento de mentira: só responde `load_objects`, que é tudo que a leitura usa. */
function equipamentoFake(tabelas: Record<string, Linha[]>) {
  const chamadas: string[] = [];
  const post = async (path: string, body: any) => {
    if (path !== '/load_objects.fcgi') throw new Error(`a leitura não deveria chamar ${path}`);
    chamadas.push(body.object);
    return { data: { [body.object]: tabelas[body.object] ?? [] } };
  };
  return { post, chamadas };
}

/** Equipamento de mentira com escrita: registra tudo que foi enviado. */
function equipamentoGravavel(tabelas: Record<string, Linha[]> = {}, opcoes: { semIds?: boolean } = {}) {
  let proximoId = 700;
  const enviado: Array<{ path: string; body: any }> = [];
  const casa = (l: Linha, w?: Linha) => !w || Object.entries(w).every(([k, v]) => String(l[k]) === String(v));
  const post = async (path: string, body: any) => {
    enviado.push({ path, body });
    const t = (tabelas[body.object] ??= []);
    switch (path) {
      case '/load_objects.fcgi':
        return { data: { [body.object]: t.filter((l) => casa(l, body.where?.[body.object])) } };
      case '/create_objects.fcgi': {
        const ids = body.values.map((v: Linha) => {
          const linha = { id: proximoId++, ...v };
          t.push(linha);
          return linha.id;
        });
        // Alguns firmwares não devolvem `ids`; a leitura por nome é o plano B.
        return { data: opcoes.semIds ? {} : { ids } };
      }
      case '/modify_objects.fcgi':
        t.filter((l) => casa(l, body.where?.[body.object])).forEach((l) => Object.assign(l, body.values));
        return { data: {} };
      case '/destroy_objects.fcgi':
        tabelas[body.object] = t.filter((l) => !casa(l, body.where?.[body.object]));
        return { data: {} };
    }
    throw new Error(path);
  };
  return { post, enviado, tabelas };
}

const CATRACA: Record<string, Linha[]> = {
  areas: [
    { id: 3, name: 'Área Interna' },
    { id: 4, name: 'Área Externa' },
  ],
  portals: [
    { id: 3, name: 'Entrada Área Interna', area_from_id: 4, area_to_id: 3 },
    { id: 4, name: 'Entrada Área Externa', area_from_id: 3, area_to_id: 4 },
  ],
  time_zones: [
    { id: 10, name: 'catec manha' },
    { id: 11, name: 'catec manha saida' },
  ],
  time_spans: [
    { time_zone_id: 10, start: 23400, end: 27000, sun: 0, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, hol1: 0, hol2: 0, hol3: 0 },
    { time_zone_id: 11, start: 41400, end: 45000, sun: 0, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 0, hol1: 0, hol2: 0, hol3: 0 },
  ],
  groups: [{ id: 25, name: 'Catec manha' }],
  access_rules: [
    { id: 18, name: 'Catec manha', type: 1, priority: 0 },
    { id: 19, name: 'Catec manha - Saida', type: 1, priority: 0 },
  ],
  access_rule_time_zones: [
    { id: 16, access_rule_id: 18, time_zone_id: 10 },
    { id: 17, access_rule_id: 19, time_zone_id: 11 },
  ],
  portal_access_rules: [
    { portal_id: 3, access_rule_id: 18 },
    { portal_id: 4, access_rule_id: 19 },
  ],
  group_access_rules: [
    { group_id: 25, access_rule_id: 18 },
    { group_id: 25, access_rule_id: 19 },
  ],
};

describe('createControlIdAccessConfig.readAll', () => {
  it('monta o retrato completo do caso validado em bancada', async () => {
    const { post } = equipamentoFake(CATRACA);
    const s = await createControlIdAccessConfig(post).readAll();

    expect(s.areas).toEqual([
      { id: '3', nome: 'Área Interna' },
      { id: '4', nome: 'Área Externa' },
    ]);
    // O portal é a aresta dirigida: entrar na Área Interna é sair da Externa.
    expect(s.portais[0]).toEqual({ id: '3', nome: 'Entrada Área Interna', areaFromId: '4', areaToId: '3' });

    const entrada = s.horarios.find((h) => h.id === '10')!;
    expect(entrada.nome).toBe('catec manha');
    expect(entrada.spans).toEqual([
      { start: 23400, end: 27000, dias: [0, 1, 1, 1, 1, 1, 0], feriados: [0, 0, 0] },
    ]);

    const saida = s.regras.find((r) => r.id === '19')!;
    expect(saida).toEqual({
      id: '19',
      nome: 'Catec manha - Saida',
      tipo: 1,
      horarioIds: ['11'],
      portalIds: ['4'],
      grupoIds: ['25'],
    });
  });

  it('lê cada tabela uma vez só, sem uma consulta por regra', async () => {
    const { post, chamadas } = equipamentoFake(CATRACA);
    await createControlIdAccessConfig(post).readAll();

    expect(chamadas.sort()).toEqual(
      [
        'access_rule_time_zones',
        'access_rules',
        'areas',
        'group_access_rules',
        'groups',
        'portal_access_rules',
        'portals',
        'time_spans',
        'time_zones',
      ].sort(),
    );
    expect(chamadas).toHaveLength(9);
  });

  it('preserva regra de bloqueio e regra sem horário em vez de descartá-las', async () => {
    const { post } = equipamentoFake({
      ...CATRACA,
      access_rules: [
        { id: 30, name: 'Bloqueio visitante', type: 0 },
        { id: 31, name: 'Sempre Liberado' },
      ],
      access_rule_time_zones: [],
      portal_access_rules: [{ portal_id: 3, access_rule_id: 31 }],
      group_access_rules: [],
    });
    const s = await createControlIdAccessConfig(post).readAll();

    expect(s.regras.find((r) => r.id === '30')!.tipo).toBe(0);
    // Sem `type` o firmware assume permissão; sem horário, o §8.3 do runbook diz "sempre válida".
    const semHorario = s.regras.find((r) => r.id === '31')!;
    expect(semHorario.tipo).toBe(1);
    expect(semHorario.horarioIds).toEqual([]);
    expect(semHorario.portalIds).toEqual(['3']);
  });

  it('aguenta portal órfão, linha sem id e horário sem intervalo', async () => {
    const { post } = equipamentoFake({
      areas: [{ id: 1, name: 'Área' }, { name: 'sem id' }],
      portals: [{ id: 9, name: 'Portal solto' }],
      time_zones: [{ id: 5, name: 'vazio' }],
      time_spans: [{ time_zone_id: null, start: 0, end: 10 }],
      groups: [],
      access_rules: [],
      access_rule_time_zones: [],
      portal_access_rules: [],
      group_access_rules: [],
    });
    const s = await createControlIdAccessConfig(post).readAll();

    expect(s.areas).toEqual([{ id: '1', nome: 'Área' }]);
    expect(s.portais[0]).toMatchObject({ areaFromId: null, areaToId: null });
    expect(s.horarios[0].spans).toEqual([]);
  });
});

describe('createControlIdAccessConfig — escrita', () => {
  it('cria área e portal com o sentido explícito', async () => {
    const eq = equipamentoGravavel();
    const cfg = createControlIdAccessConfig(eq.post);

    const interna = await cfg.criarArea('Área Interna');
    const externa = await cfg.criarArea('Área Externa');
    const portal = await cfg.criarPortal('Entrada Área Interna', externa, interna);

    // Entrar na Área Interna é sair da Externa: from = externa, to = interna.
    expect(eq.tabelas.portals).toEqual([
      { id: Number(portal), name: 'Entrada Área Interna', area_from_id: Number(externa), area_to_id: Number(interna) },
    ]);
  });

  it('acha o id pelo nome quando o equipamento não devolve `ids`', async () => {
    const eq = equipamentoGravavel({}, { semIds: true });
    const cfg = createControlIdAccessConfig(eq.post);

    const id = await cfg.criarArea('Pátio');

    expect(id).toBe(String(eq.tabelas.areas[0].id));
  });

  it('substituir intervalos apaga os antigos antes de gravar os novos', async () => {
    const eq = equipamentoGravavel({ time_spans: [{ id: 1, time_zone_id: 50, start: 0, end: 100 }] });
    const cfg = createControlIdAccessConfig(eq.post);

    await cfg.substituirIntervalos('50', [
      { start: 23400, end: 27000, dias: [false, true, true, true, true, true, false] },
    ]);

    expect(eq.enviado[0].path).toBe('/destroy_objects.fcgi');
    expect(eq.tabelas.time_spans).toEqual([
      expect.objectContaining({
        time_zone_id: 50,
        start: 23400,
        end: 27000,
        sun: 0,
        mon: 1,
        fri: 1,
        sat: 0,
        hol1: 0,
      }),
    ]);
  });

  it('limita o fim do intervalo a 86399, o fim do dia do firmware', async () => {
    const eq = equipamentoGravavel();
    const cfg = createControlIdAccessConfig(eq.post);

    await cfg.substituirIntervalos('50', [{ start: 0, end: 86400, dias: [true, true, true, true, true, true, true] }]);

    expect(eq.tabelas.time_spans[0]).toMatchObject({ start: 0, end: 86399 });
  });

  it('remover horário apaga os intervalos antes do horário, e não toca nos vínculos', async () => {
    const eq = equipamentoGravavel({
      time_zones: [{ id: 50, name: 'manha' }],
      time_spans: [{ id: 1, time_zone_id: 50 }],
      access_rule_time_zones: [{ id: 9, access_rule_id: 18, time_zone_id: 50 }],
    });
    const cfg = createControlIdAccessConfig(eq.post);

    await cfg.removerHorario('50');

    expect(eq.enviado.map((e) => e.body.object)).toEqual(['time_spans', 'time_zones']);
    expect(eq.tabelas.time_zones).toEqual([]);
    // O vínculo continua: barrar horário em uso é decisão do núcleo, não do adaptador.
    expect(eq.tabelas.access_rule_time_zones).toHaveLength(1);
  });

  it('nunca chama tabela de vínculo ao criar objetos próprios (armadilha §6.1)', async () => {
    const eq = equipamentoGravavel();
    const cfg = createControlIdAccessConfig(eq.post);

    await cfg.criarArea('A');
    await cfg.criarHorario('h');

    const vinculos = ['access_rule_time_zones', 'portal_access_rules', 'group_access_rules'];
    expect(eq.enviado.some((e) => vinculos.includes(e.body.object))).toBe(false);
  });
});

describe('createControlIdAccessConfig — departamentos e regras', () => {
  it('monta a cadeia do runbook: regra → horário → portal → departamento', async () => {
    const eq = equipamentoGravavel({ groups: [{ id: 25, name: 'Catec manha' }] });
    const cfg = createControlIdAccessConfig(eq.post);

    const regra = await cfg.criarRegra('SchoolGuard Catec manha - saida');
    await cfg.definirHorariosDaRegra(regra, ['11']);
    await cfg.definirPortaisDaRegra(regra, ['4']);
    await cfg.ligarRegraAoGrupo('25', regra);

    expect(eq.tabelas.access_rules[0]).toMatchObject({ name: 'SchoolGuard Catec manha - saida', type: 1, priority: 0 });
    expect(eq.tabelas.access_rule_time_zones[0]).toMatchObject({ access_rule_id: Number(regra), time_zone_id: 11 });
    expect(eq.tabelas.portal_access_rules[0]).toMatchObject({ portal_id: 4, access_rule_id: Number(regra) });
    expect(eq.tabelas.group_access_rules[0]).toMatchObject({ group_id: 25, access_rule_id: Number(regra) });
  });

  it('o id propagado é o da regra, nunca o da linha de vínculo (armadilha §6.1)', async () => {
    const eq = equipamentoGravavel();
    const cfg = createControlIdAccessConfig(eq.post);

    const regra = await cfg.criarRegra('R');
    await cfg.definirHorariosDaRegra(regra, ['11']);
    await cfg.definirPortaisDaRegra(regra, ['4']);

    // Todos os vínculos apontam para o MESMO id, o que veio de access_rules.
    const usados = [
      ...eq.tabelas.access_rule_time_zones.map((l) => String(l.access_rule_id)),
      ...eq.tabelas.portal_access_rules.map((l) => String(l.access_rule_id)),
    ];
    expect(new Set(usados)).toEqual(new Set([regra]));
    expect(String(eq.tabelas.access_rules[0].id)).toBe(regra);
  });

  it('uma regra em duas áreas vira dois portal_access_rules na mesma regra', async () => {
    const eq = equipamentoGravavel();
    const cfg = createControlIdAccessConfig(eq.post);

    const regra = await cfg.criarRegra('Integral');
    await cfg.definirPortaisDaRegra(regra, ['3', '4']);

    expect(eq.tabelas.portal_access_rules).toHaveLength(2);
    expect(eq.tabelas.portal_access_rules.map((l) => l.portal_id).sort()).toEqual([3, 4]);
  });

  it('remover regra apaga os vínculos antes da regra', async () => {
    const eq = equipamentoGravavel({
      access_rules: [{ id: 19, name: 'R' }],
      access_rule_time_zones: [{ id: 1, access_rule_id: 19, time_zone_id: 11 }],
      portal_access_rules: [{ portal_id: 4, access_rule_id: 19 }],
      group_access_rules: [{ group_id: 25, access_rule_id: 19 }],
    });
    const cfg = createControlIdAccessConfig(eq.post);

    await cfg.removerRegra('19');

    expect(eq.enviado.map((e) => e.body.object)).toEqual([
      'access_rule_time_zones',
      'portal_access_rules',
      'group_access_rules',
      'access_rules',
    ]);
    expect(eq.tabelas.access_rules).toEqual([]);
  });

  it('desligar do grupo preserva a regra para os outros departamentos', async () => {
    const eq = equipamentoGravavel({
      access_rules: [{ id: 19, name: 'R' }],
      group_access_rules: [
        { group_id: 25, access_rule_id: 19 },
        { group_id: 26, access_rule_id: 19 },
      ],
    });
    const cfg = createControlIdAccessConfig(eq.post);

    await cfg.desligarRegraDoGrupo('25', '19');

    expect(eq.tabelas.access_rules).toHaveLength(1);
    expect(eq.tabelas.group_access_rules).toEqual([{ group_id: 26, access_rule_id: 19 }]);
  });

  it('ligar ao grupo é idempotente: não duplica o vínculo', async () => {
    const eq = equipamentoGravavel({ group_access_rules: [{ group_id: 25, access_rule_id: 19 }] });
    const cfg = createControlIdAccessConfig(eq.post);

    await cfg.ligarRegraAoGrupo('25', '19');

    expect(eq.tabelas.group_access_rules).toHaveLength(1);
    expect(eq.enviado.some((e) => e.path === '/create_objects.fcgi')).toBe(false);
  });
});
