import { canonizarRegras } from '../../../../turma/core/perfil-canonico';
import { compararRegras, regrasAplicadas } from '../../../../turma/core/inspecao';
import {
  createControlIdAccessGroup,
  nomeHorario,
  paraTimeSpans,
  spansDiaInteiro,
  type ControlIdAccessGroup,
} from './controlid-access-group';

type Linha = Record<string, any>;

/** Equipamento Control iD simulado: tabelas em memória + load/create/modify/destroy com filtro por igualdade. */
function equipamentoFake(inicial: Record<string, Linha[]> = {}) {
  const semId = new Set(['group_access_rules', 'portal_access_rules', 'access_rule_time_zones', 'user_groups']);
  const tabelas: Record<string, Linha[]> = { user_groups: [], ...inicial };
  let proximoId = 100;
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
    throw new Error(`endpoint inesperado ${path}`);
  };
  return { tabelas, post };
}

const SEG_SEX_17_18: Array<Array<[number, number]>> = [[], [[1020, 1080]], [[1020, 1080]], [[1020, 1080]], [[1020, 1080]], [[1020, 1080]], []];

/** Catraca como sai de fábrica: um portal padrão e a regra "Sempre Liberado" do grupo Student ligada a ele. */
function catracaPadrao() {
  return equipamentoFake({
    groups: [{ id: 1, name: 'Student' }],
    portals: [{ id: 1, name: 'Portal padrão' }],
    access_rules: [{ id: 1, name: 'Sempre Liberado', type: 1, priority: 0 }],
    group_access_rules: [{ group_id: 1, access_rule_id: 1 }],
    portal_access_rules: [{ portal_id: 1, access_rule_id: 1 }],
  });
}

const grupo = (over: Partial<ControlIdAccessGroup> = {}): ControlIdAccessGroup => ({
  codigo: '101',
  nome: 'MATUTINO-01',
  interna: { modo: 'livre', dias: null },
  externa: { modo: 'horario', dias: SEG_SEX_17_18 },
  ...over,
});

describe('utilitários', () => {
  it('paraTimeSpans agrupa dias com o mesmo intervalo (segundos, 23:59:59 no fim do dia)', () => {
    expect(paraTimeSpans(SEG_SEX_17_18, 7)).toEqual([
      expect.objectContaining({ time_zone_id: 7, start: 61200, end: 64800, sun: 0, mon: 1, fri: 1, sat: 0, hol1: 0 }),
    ]);
    expect(paraTimeSpans([[], [[1080, 1440]], [], [], [], [], []], 1)[0].end).toBe(86399);
  });

  it('sempre liberado = 24 h, todos os dias e feriados', () => {
    expect(spansDiaInteiro(3)).toEqual([
      expect.objectContaining({ start: 0, end: 86399, sun: 1, sat: 1, hol1: 1, hol2: 1, hol3: 1 }),
    ]);
  });

  it('nome do horário é único por perfil e sentido e cabe em 15 bytes', () => {
    expect(nomeHorario('101', 'interna', 'MATUTINO-01')).toBe('I101 MATUTINO-0');
    expect(nomeHorario('101', 'externa', 'MATUTINO-01')).toBe('E101 MATUTINO-0');
    expect(Buffer.byteLength(nomeHorario('12345', 'interna', 'SEMIINTEGRAL-01'))).toBeLessThanOrEqual(15);
  });
});

describe('prepareDirection (SpecControlId §6.1–6.2 e §8.2)', () => {
  it('cria as áreas e os portais no sentido correto e replica a regra geral nos portais novos', async () => {
    const eq = catracaPadrao();
    const r = await createControlIdAccessGroup(eq.post).prepareDirection();

    const area = (nome: string) => eq.tabelas.areas.find((a) => a.name === nome)!.id;
    expect(eq.tabelas.areas.map((a) => a.name).sort()).toEqual(['Área Externa', 'Área Interna']);
    expect(eq.tabelas.portals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Entrada Área Interna', area_from_id: area('Área Externa'), area_to_id: area('Área Interna') }),
        expect.objectContaining({ name: 'Entrada Área Externa', area_from_id: area('Área Interna'), area_to_id: area('Área Externa') }),
      ]),
    );
    expect(r.criados).toEqual({ areas: 2, portais: 2 });
    expect(r.portaisPreexistentes.map((p) => p.id)).toEqual(['1']);

    // quem não é de turma continua passando nos dois sentidos
    expect(r.regrasReplicadas).toBe(1);
    const portaisDaRegraGeral = eq.tabelas.portal_access_rules.filter((v) => v.access_rule_id === 1).map((v) => String(v.portal_id)).sort();
    expect(portaisDaRegraGeral).toEqual(['1', r.portalExternaId, r.portalInternaId].sort());
  });

  it('é idempotente e reconhece áreas/portais existentes (inclusive nome sem acento)', async () => {
    const eq = equipamentoFake({
      areas: [{ id: 7, name: 'Area Interna' }, { id: 8, name: 'Area Externa' }],
      portals: [{ id: 21, name: 'entra', area_from_id: 8, area_to_id: 7 }, { id: 22, name: 'sai', area_from_id: 7, area_to_id: 8 }],
    });
    const ag = createControlIdAccessGroup(eq.post);
    const r1 = await ag.prepareDirection();
    const r2 = await ag.prepareDirection();
    expect(r1).toMatchObject({ areaInternaId: '7', areaExternaId: '8', portalInternaId: '21', portalExternaId: '22', criados: { areas: 0, portais: 0 } });
    expect(r2).toEqual(r1);
    expect(eq.tabelas.portals).toHaveLength(2);
  });
});

describe('sync por sentido (allow-only, §5)', () => {
  async function preparado() {
    const eq = catracaPadrao();
    const ag = createControlIdAccessGroup(eq.post);
    const p = await ag.prepareDirection();
    return { eq, ag, portais: { interna: p.portalInternaId, externa: p.portalExternaId } };
  }

  it('cria uma regra por sentido, cada uma ligada SÓ ao portal do seu sentido', async () => {
    const { eq, ag, portais } = await preparado();
    const ref = await ag.sync(grupo(), undefined, portais);

    const portaisDaRegra = (id?: string) =>
      eq.tabelas.portal_access_rules.filter((v) => String(v.access_rule_id) === id).map((v) => String(v.portal_id));
    expect(portaisDaRegra(ref.interna?.accessRuleId)).toEqual([portais.interna]);
    expect(portaisDaRegra(ref.externa?.accessRuleId)).toEqual([portais.externa]);

    const vinculosGrupo = eq.tabelas.group_access_rules.filter((v) => String(v.group_id) === ref.groupId).map((v) => String(v.access_rule_id));
    expect(vinculosGrupo.sort()).toEqual([ref.interna?.accessRuleId, ref.externa?.accessRuleId].sort());

    const spans = (tz?: string) => eq.tabelas.time_spans.filter((s) => String(s.time_zone_id) === tz);
    expect(spans(ref.interna?.timeZoneId)).toEqual([expect.objectContaining({ start: 0, end: 86399, hol1: 1 })]);
    expect(spans(ref.externa?.timeZoneId)).toEqual([expect.objectContaining({ start: 61200, end: 64800, mon: 1, sun: 0 })]);
    expect(eq.tabelas.time_zones.map((t) => t.name).sort()).toEqual(['E101 MATUTINO-0', 'I101 MATUTINO-0']);
  });

  it('é idempotente; mudar a saída para bloqueado remove só a regra e o horário da saída', async () => {
    const { eq, ag, portais } = await preparado();
    const ref = await ag.sync(grupo(), undefined, portais);
    expect(await ag.sync(grupo(), ref, portais)).toEqual(ref);
    expect(eq.tabelas.access_rules).toHaveLength(3); // Sempre Liberado + 2

    const ref2 = await ag.sync(grupo({ externa: { modo: 'bloqueado', dias: null } }), ref, portais);
    expect(ref2.interna).toEqual(ref.interna);
    expect(ref2.externa).toEqual({});
    expect(eq.tabelas.access_rules.map((r) => String(r.id))).not.toContain(ref.externa?.accessRuleId);
    expect(eq.tabelas.time_zones.map((t) => String(t.id))).not.toContain(ref.externa?.timeZoneId);
    expect(eq.tabelas.portal_access_rules.some((v) => String(v.portal_id) === portais.externa && String(v.access_rule_id) !== '1')).toBe(false);
  });

  it('converte a regra do formato anterior (ligada a todos os portais) e só desvincula regras de terceiros', async () => {
    const { eq, ag, portais } = await preparado();
    // formato anterior: departamento com uma regra em todos os portais, ids gravados como "interna"
    eq.tabelas.groups.push({ id: 50, name: 'MATUTINO-01' });
    eq.tabelas.access_rules.push({ id: 60, name: 'antiga', type: 1, priority: 0 }, { id: 70, name: 'de terceiro', type: 1, priority: 0 });
    eq.tabelas.group_access_rules.push({ group_id: 50, access_rule_id: 60 }, { group_id: 50, access_rule_id: 70 });
    for (const portal of ['1', portais.interna, portais.externa]) eq.tabelas.portal_access_rules.push({ portal_id: Number(portal), access_rule_id: 60 });

    const ref = await ag.sync(grupo(), { groupId: '50', interna: { accessRuleId: '60' } }, portais);

    expect(ref.groupId).toBe('50');
    expect(ref.interna?.accessRuleId).toBe('60'); // reaproveitada
    expect(eq.tabelas.portal_access_rules.filter((v) => v.access_rule_id === 60).map((v) => String(v.portal_id))).toEqual([portais.interna]);
    expect(eq.tabelas.group_access_rules.some((v) => v.group_id === 50 && v.access_rule_id === 70)).toBe(false);
    expect(eq.tabelas.access_rules.some((r) => r.id === 70)).toBe(true); // não apaga o que não é nosso
  });

  it('recusa sincronizar se os portais de sentido não existem mais', async () => {
    const { ag } = await preparado();
    await expect(ag.sync(grupo(), undefined, { interna: '999', externa: '998' })).rejects.toThrow(/prepare as áreas novamente/);
  });

  it('inspect reproduz exatamente as regras configuradas (via regrasAplicadas)', async () => {
    const { ag, portais } = await preparado();
    const ref = await ag.sync(grupo(), undefined, portais);
    const inspecao = await ag.inspect(ref, 'MATUTINO-01');

    expect(inspecao.encontrado).toBe(true);
    expect(inspecao.regras).toHaveLength(2);
    const esperado = canonizarRegras({
      interna: { modo: 'livre' },
      externa: { modo: 'horario', horarios: [{ inicio: '17:00', fim: '18:00', dias: [false, true, true, true, true, true, false] }] },
    });
    expect(compararRegras(esperado, regrasAplicadas(inspecao, portais))).toEqual([]);
    // com os portais trocados, a leitura acusa a inversão
    expect(compararRegras(esperado, regrasAplicadas(inspecao, { interna: portais.externa, externa: portais.interna }))).toHaveLength(2);
  });

  it('conta membros no equipamento e remove departamento, regras e horários', async () => {
    const { eq, ag, portais } = await preparado();
    const ref = await ag.sync(grupo(), undefined, portais);
    eq.tabelas.user_groups.push({ user_id: 1, group_id: Number(ref.groupId) });
    expect(await ag.countMembers(ref)).toBe(1);
    eq.tabelas.user_groups = [];

    await ag.remove(ref);
    expect(eq.tabelas.groups.map((g) => g.name)).toEqual(['Student']);
    expect(eq.tabelas.access_rules.map((r) => r.name)).toEqual(['Sempre Liberado']);
    expect(eq.tabelas.time_zones).toEqual([]);
    expect(eq.tabelas.time_spans).toEqual([]);
    expect(eq.tabelas.portals).toHaveLength(3); // áreas e portais continuam
  });
});
