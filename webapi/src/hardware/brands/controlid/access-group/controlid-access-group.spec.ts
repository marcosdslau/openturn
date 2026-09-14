import { createControlIdAccessGroup, paraTimeSpans } from './controlid-access-group';

type Linha = Record<string, any>;

/** Equipamento Control iD simulado: tabelas em memória + load/create/modify/destroy com filtro simples. */
function criarEquipamentoFake(inicial: Record<string, Linha[]> = {}) {
  const tabelas: Record<string, Linha[]> = {
    groups: [],
    access_rules: [],
    group_access_rules: [],
    portal_access_rules: [],
    portals: [{ id: 1, name: 'Catraca' }],
    time_zones: [],
    time_spans: [],
    access_rule_time_zones: [],
    user_groups: [],
    ...inicial,
  };
  let proximoId = 100;
  const chamadas: string[] = [];
  const casa = (linha: Linha, where?: Record<string, any>) =>
    !where || Object.entries(where).every(([k, v]) => String(linha[k]) === String(v));

  const post = async (path: string, body: any) => {
    chamadas.push(`${path.replace('.fcgi', '')}:${body.object}`);
    const t = (tabelas[body.object] ??= []);
    const filtro = body.where?.[body.object];
    if (path === '/load_objects.fcgi') return { data: { [body.object]: t.filter((l) => casa(l, filtro)) } };
    if (path === '/create_objects.fcgi') {
      const ids = body.values.map((v: Linha) => {
        const temId = 'id' in v || !['group_access_rules', 'portal_access_rules', 'access_rule_time_zones', 'user_groups'].includes(body.object);
        const linha = temId ? { id: v.id ?? proximoId++, ...v } : { ...v };
        t.push(linha);
        return linha.id;
      });
      return { data: { ids } };
    }
    if (path === '/modify_objects.fcgi') {
      t.filter((l) => casa(l, filtro)).forEach((l) => Object.assign(l, body.values));
      return { data: { changes: 1 } };
    }
    if (path === '/destroy_objects.fcgi') {
      const antes = t.length;
      tabelas[body.object] = t.filter((l) => !casa(l, filtro));
      return { data: { changes: antes - tabelas[body.object].length } };
    }
    throw new Error(`endpoint inesperado ${path}`);
  };

  return { tabelas, post, chamadas };
}

const SEG_SEX_MANHA: Array<Array<[number, number]>> = [[], [[390, 750]], [[390, 750]], [[390, 750]], [[390, 750]], [[390, 750]], []];

describe('paraTimeSpans', () => {
  it('agrupa dias com o mesmo intervalo e converte minutos para segundos', () => {
    const spans = paraTimeSpans(SEG_SEX_MANHA, 7);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ time_zone_id: 7, start: 23400, end: 45000, sun: 0, mon: 1, fri: 1, sat: 0 });
  });

  it('meia-noite vira 86399 (fim do dia)', () => {
    const spans = paraTimeSpans([[], [[1080, 1440]], [[0, 30]], [], [], [], []], 1);
    expect(spans.find((s) => s.mon === 1)?.end).toBe(86399);
    expect(spans.find((s) => s.tue === 1)).toMatchObject({ start: 0, end: 1800 });
  });
});

describe('createControlIdAccessGroup', () => {
  it('cria departamento, regra, vínculo com portais, horário e intervalos', async () => {
    const eq = criarEquipamentoFake();
    const ag = createControlIdAccessGroup(eq.post);

    const ref = await ag.sync({ nome: 'MATUTINO-01', dias: SEG_SEX_MANHA });

    expect(eq.tabelas.groups).toEqual([expect.objectContaining({ name: 'MATUTINO-01', id: Number(ref.groupId) })]);
    expect(eq.tabelas.group_access_rules).toEqual([{ group_id: Number(ref.groupId), access_rule_id: Number(ref.accessRuleId) }]);
    expect(eq.tabelas.portal_access_rules).toEqual([{ portal_id: 1, access_rule_id: Number(ref.accessRuleId) }]);
    expect(eq.tabelas.time_zones).toEqual([expect.objectContaining({ name: 'MATUTINO-01', id: Number(ref.timeZoneId) })]);
    expect(eq.tabelas.time_spans).toHaveLength(1);
    expect(eq.tabelas.access_rule_time_zones).toEqual([
      { access_rule_id: Number(ref.accessRuleId), time_zone_id: Number(ref.timeZoneId) },
    ]);
  });

  it('é idempotente: segundo sync não duplica objetos e substitui os intervalos', async () => {
    const eq = criarEquipamentoFake();
    const ag = createControlIdAccessGroup(eq.post);
    const ref = await ag.sync({ nome: 'MATUTINO-01', dias: SEG_SEX_MANHA });
    const tarde: Array<Array<[number, number]>> = [[], [[780, 1080]], [], [], [], [], []];
    const ref2 = await ag.sync({ nome: 'MATUTINO-01', dias: tarde }, ref);

    expect(ref2).toEqual(ref);
    expect(eq.tabelas.groups).toHaveLength(1);
    expect(eq.tabelas.access_rules).toHaveLength(1);
    expect(eq.tabelas.portal_access_rules).toHaveLength(1);
    expect(eq.tabelas.time_zones).toHaveLength(1);
    expect(eq.tabelas.time_spans).toEqual([expect.objectContaining({ start: 46800, end: 64800, mon: 1, tue: 0 })]);
    expect(eq.tabelas.access_rule_time_zones).toHaveLength(1);
  });

  it('substitui horário herdado ("Sempre Liberado") na regra de um departamento existente', async () => {
    const eq = criarEquipamentoFake({
      groups: [{ id: 5, name: 'MATUTINO-01' }],
      access_rules: [{ id: 9, name: 'regra', type: 1, priority: 0 }],
      group_access_rules: [{ group_id: 5, access_rule_id: 9 }],
      time_zones: [{ id: 1, name: 'Sempre Liberado' }],
      access_rule_time_zones: [{ access_rule_id: 9, time_zone_id: 1 }],
    });
    const ref = await createControlIdAccessGroup(eq.post).sync({ nome: 'MATUTINO-01', dias: SEG_SEX_MANHA });

    expect(ref.groupId).toBe('5');
    expect(ref.accessRuleId).toBe('9');
    expect(eq.tabelas.access_rule_time_zones).toEqual([{ access_rule_id: 9, time_zone_id: Number(ref.timeZoneId) }]);
    expect(eq.tabelas.time_zones.map((t) => t.name).sort()).toEqual(['MATUTINO-01', 'Sempre Liberado']);
  });

  it('renomeia pelo id conhecido em vez de criar outro departamento', async () => {
    const eq = criarEquipamentoFake();
    const ag = createControlIdAccessGroup(eq.post);
    const ref = await ag.sync({ nome: 'MATUTINO-01', dias: SEG_SEX_MANHA });
    await ag.sync({ nome: 'MANHA-A', dias: SEG_SEX_MANHA }, ref);

    expect(eq.tabelas.groups).toEqual([expect.objectContaining({ id: Number(ref.groupId), name: 'MANHA-A' })]);
    expect(eq.tabelas.time_zones).toEqual([expect.objectContaining({ id: Number(ref.timeZoneId), name: 'MANHA-A' })]);
  });

  it('conta membros no equipamento e remove tudo quando vazio', async () => {
    const eq = criarEquipamentoFake();
    const ag = createControlIdAccessGroup(eq.post);
    const ref = await ag.sync({ nome: 'MATUTINO-01', dias: SEG_SEX_MANHA });

    eq.tabelas.user_groups.push({ user_id: 1, group_id: Number(ref.groupId) }, { user_id: 2, group_id: 999 });
    expect(await ag.countMembers(ref)).toBe(1);

    eq.tabelas.user_groups = eq.tabelas.user_groups.filter((u) => u.group_id !== Number(ref.groupId));
    expect(await ag.countMembers(ref)).toBe(0);

    await ag.remove(ref);
    for (const tabela of ['groups', 'access_rules', 'group_access_rules', 'portal_access_rules', 'time_zones', 'time_spans', 'access_rule_time_zones']) {
      expect({ tabela, linhas: eq.tabelas[tabela] }).toEqual({ tabela, linhas: [] });
    }
    expect(eq.tabelas.portals).toHaveLength(1);
  });
});
