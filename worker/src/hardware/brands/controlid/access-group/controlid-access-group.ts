// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/hardware/brands/controlid/access-group/controlid-access-group.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/**
 * Grupos de acesso (departamento + horário) no Control iD.
 *
 * FONTE DA VERDADE em webapi/src/hardware/brands/controlid/access-group. O worker recebe
 * uma cópia gerada no build (`npm run shared:sync`) — não edite a cópia. Não importa nada:
 * recebe apenas a função de POST do provider (com sessão e retry já tratados).
 *
 * Cadeia no equipamento:
 *   groups ─group_access_rules─> access_rules ─access_rule_time_zones─> time_zones ─> time_spans
 *                                     └─portal_access_rules─> portals
 */

export type ControlIdPost = (fcgiPath: string, body: unknown) => Promise<{ data: unknown }>;

/** 7 posições (dom..sab), intervalos [inicio, fim) em minutos, meia-noite já dividida. */
export interface ControlIdAccessGroup {
  nome: string;
  dias: Array<Array<[number, number]>>;
}

export interface ControlIdAccessGroupRef {
  groupId?: string;
  accessRuleId?: string;
  timeZoneId?: string;
}

type Linha = Record<string, unknown> & { id?: number | string; name?: string };

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** Agrupa os dias que têm o mesmo intervalo num único time_span. */
export function paraTimeSpans(dias: Array<Array<[number, number]>>, timeZoneId: number) {
  const porIntervalo = new Map<string, number[]>();
  dias.forEach((intervalos, d) =>
    intervalos.forEach(([ini, fim]) => {
      const chave = `${ini}-${fim}`;
      if (!porIntervalo.has(chave)) porIntervalo.set(chave, [0, 0, 0, 0, 0, 0, 0]);
      porIntervalo.get(chave)![d] = 1;
    }),
  );
  return [...porIntervalo].map(([chave, d]) => {
    const [ini, fim] = chave.split('-').map(Number);
    return {
      time_zone_id: timeZoneId,
      start: ini * 60,
      end: Math.min(fim * 60, 86399),
      sun: d[0],
      mon: d[1],
      tue: d[2],
      wed: d[3],
      thu: d[4],
      fri: d[5],
      sat: d[6],
      hol1: 0,
      hol2: 0,
      hol3: 0,
    };
  });
}

export function createControlIdAccessGroup(post: ControlIdPost) {
  const carregar = async (object: string, where?: Record<string, unknown>): Promise<Linha[]> => {
    const res = await post('/load_objects.fcgi', where ? { object, where: { [object]: where } } : { object });
    return (((res.data as Record<string, unknown>)?.[object] as Linha[]) ?? []).filter(Boolean);
  };

  const criar = async (object: string, values: Record<string, unknown>[]): Promise<number[]> => {
    const res = await post('/create_objects.fcgi', { object, values });
    return (((res.data as Record<string, unknown>)?.ids as number[]) ?? []).map(Number);
  };

  const apagar = (object: string, where: Record<string, unknown>) =>
    post('/destroy_objects.fcgi', { object, where: { [object]: where } });

  const renomear = (object: string, id: number, name: string) =>
    post('/modify_objects.fcgi', { object, values: { name }, where: { [object]: { id } } });

  /** Acha por id conhecido; senão por nome; senão cria. Renomeia quando o nome diverge. */
  async function garantirPorNome(object: 'groups' | 'time_zones', nome: string, idConhecido?: string): Promise<number> {
    let linhas = await carregar(object);
    let alvo = idConhecido ? linhas.find((l) => String(l.id) === String(idConhecido)) : undefined;
    alvo ??= linhas.find((l) => norm(l.name) === norm(nome));

    if (!alvo) {
      const [id] = await criar(object, [{ name: nome }]);
      if (Number.isFinite(id)) return id;
      linhas = await carregar(object);
      alvo = linhas.find((l) => norm(l.name) === norm(nome));
      if (!alvo?.id) throw new Error(`${object} "${nome}" criado, mas o id não foi encontrado no equipamento`);
    }

    const id = Number(alvo.id);
    if (String(alvo.name ?? '') !== nome) await renomear(object, id, nome);
    return id;
  }

  async function regraDoGrupo(groupId: number): Promise<number | null> {
    const vinculos = await carregar('group_access_rules', { group_id: groupId });
    const id = vinculos.map((v) => Number(v.access_rule_id)).find((n) => Number.isFinite(n));
    return id ?? null;
  }

  async function sync(grupo: ControlIdAccessGroup, ref?: ControlIdAccessGroupRef): Promise<ControlIdAccessGroupRef> {
    // 1. departamento
    const groupId = await garantirPorNome('groups', grupo.nome, ref?.groupId);

    // 2. regra de acesso do departamento (+ vínculo com todos os portais)
    let accessRuleId = await regraDoGrupo(groupId);
    if (accessRuleId == null) {
      [accessRuleId] = await criar('access_rules', [
        { name: `(access_rules automatically created for groups ${groupId})`, type: 1, priority: 0 },
      ]);
      if (!Number.isFinite(accessRuleId)) throw new Error(`Falha ao criar access_rule para o grupo ${groupId}`);
      await criar('group_access_rules', [{ group_id: groupId, access_rule_id: accessRuleId }]);
    }
    const portais = await carregar('portals');
    const jaVinculados = new Set(
      (await carregar('portal_access_rules', { access_rule_id: accessRuleId })).map((v) => Number(v.portal_id)),
    );
    const faltando = portais.map((p) => Number(p.id)).filter((id) => Number.isFinite(id) && !jaVinculados.has(id));
    if (faltando.length) {
      await criar('portal_access_rules', faltando.map((portal_id) => ({ portal_id, access_rule_id: accessRuleId })));
    }

    // 3. horário
    const timeZoneId = await garantirPorNome('time_zones', grupo.nome, ref?.timeZoneId);

    // 4. intervalos: substitui todos
    await apagar('time_spans', { time_zone_id: timeZoneId });
    const spans = paraTimeSpans(grupo.dias, timeZoneId);
    if (spans.length) await criar('time_spans', spans);

    // 5. regra ↔ horário: remove qualquer horário herdado (ex.: "Sempre Liberado") e vincula o nosso
    await apagar('access_rule_time_zones', { access_rule_id: accessRuleId });
    await criar('access_rule_time_zones', [{ access_rule_id: accessRuleId, time_zone_id: timeZoneId }]);

    return { groupId: String(groupId), accessRuleId: String(accessRuleId), timeZoneId: String(timeZoneId) };
  }

  async function resolverGrupoId(ref: ControlIdAccessGroupRef, nome?: string): Promise<number | null> {
    if (ref.groupId && Number.isFinite(Number(ref.groupId))) return Number(ref.groupId);
    if (!nome) return null;
    const g = (await carregar('groups')).find((l) => norm(l.name) === norm(nome));
    return g?.id != null ? Number(g.id) : null;
  }

  async function countMembers(ref: ControlIdAccessGroupRef, nome?: string): Promise<number> {
    const groupId = await resolverGrupoId(ref, nome);
    if (groupId == null) return 0;
    return (await carregar('user_groups', { group_id: groupId })).length;
  }

  /** Remove departamento, regra e horário. Chamar apenas com o grupo vazio (countMembers === 0). */
  async function remove(ref: ControlIdAccessGroupRef, nome?: string): Promise<void> {
    const groupId = await resolverGrupoId(ref, nome);
    const accessRuleId = ref.accessRuleId ? Number(ref.accessRuleId) : groupId != null ? await regraDoGrupo(groupId) : null;
    const timeZoneId = ref.timeZoneId ? Number(ref.timeZoneId) : null;

    if (accessRuleId != null) {
      await apagar('access_rule_time_zones', { access_rule_id: accessRuleId });
      await apagar('portal_access_rules', { access_rule_id: accessRuleId });
      await apagar('group_access_rules', { access_rule_id: accessRuleId });
      await apagar('access_rules', { id: accessRuleId });
    }
    if (timeZoneId != null) {
      await apagar('time_spans', { time_zone_id: timeZoneId });
      await apagar('time_zones', { id: timeZoneId });
    }
    if (groupId != null) {
      await apagar('groups', { id: groupId });
    }
  }

  async function list(): Promise<Array<{ id: string; nome: string }>> {
    return (await carregar('groups'))
      .filter((g) => g.id != null)
      .map((g) => ({ id: String(g.id), nome: String(g.name ?? '') }));
  }

  return { sync, countMembers, remove, list };
}
