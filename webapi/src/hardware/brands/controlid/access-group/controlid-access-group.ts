/**
 * Grupos de acesso por sentido (Área Interna / Área Externa) no Control iD.
 * Spec: working/Controle-turma/SpecControlId.md.
 *
 * FONTE DA VERDADE em webapi/src/hardware/brands/controlid/access-group. O worker recebe
 * uma cópia gerada no build (`npm run shared:sync`) — não edite a cópia. Não importa nada:
 * recebe apenas a função de POST do provider (com sessão e retry já tratados).
 *
 * Modelo (allow-only, §5 da spec): o sentido não é atributo do departamento nem da regra —
 * é o portal. Cada sentido liberado vira uma access_rule ligada a UM portal:
 *
 *   groups ─group_access_rules─> access_rules ─portal_access_rules─> portals (area_from → area_to)
 *                                     └─access_rule_time_zones─> time_zones ─> time_spans
 *
 *   Portal "Entrada Área Interna": area_from = Área Externa, area_to = Área Interna (entrar na escola)
 *   Portal "Entrada Área Externa": area_from = Área Interna, area_to = Área Externa (sair da escola)
 */

export type ControlIdPost = (fcgiPath: string, body: unknown) => Promise<{ data: unknown }>;

export type ControlIdSentido = 'interna' | 'externa';
export const SENTIDOS_CONTROLID: readonly ControlIdSentido[] = ['interna', 'externa'];

export interface ControlIdRegraSentido {
  modo: 'livre' | 'horario' | 'bloqueado';
  /** 7 posições (dom..sab), intervalos [inicio, fim) em minutos, meia-noite já dividida. Só em 'horario'. */
  dias: Array<Array<[number, number]>> | null;
}

export interface ControlIdAccessGroup {
  /** Identificador estável (PHACodigo) — garante nomes únicos de horários. */
  codigo: string;
  nome: string;
  interna: ControlIdRegraSentido;
  externa: ControlIdRegraSentido;
}

export interface ControlIdRuleRef {
  accessRuleId?: string;
  timeZoneId?: string;
}

export interface ControlIdAccessGroupRef {
  groupId?: string;
  interna?: ControlIdRuleRef;
  externa?: ControlIdRuleRef;
}

export type ControlIdPortals = Record<ControlIdSentido, string>;

export const NOME_AREA: Record<ControlIdSentido, string> = { interna: 'Área Interna', externa: 'Área Externa' };
export const NOME_PORTAL: Record<ControlIdSentido, string> = {
  interna: 'Entrada Área Interna',
  externa: 'Entrada Área Externa',
};

type Linha = Record<string, unknown> & { id?: number | string; name?: string };

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
const mesmoId = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);

function truncarBytes(texto: string, max: number): string {
  let saida = '';
  for (const ch of texto) {
    if (Buffer.byteLength(saida + ch, 'utf8') > max) break;
    saida += ch;
  }
  return saida;
}

/** Nome do horário no equipamento: único por perfil e sentido, ≤ 15 bytes (ex.: "I101 MATUTINO-0"). */
export function nomeHorario(codigo: string, sentido: ControlIdSentido, nome: string): string {
  return truncarBytes(`${sentido === 'interna' ? 'I' : 'E'}${codigo} ${nome}`, 15).trim();
}

export function nomeRegra(nome: string, sentido: ControlIdSentido): string {
  return `SchoolGuard ${nome} - ${NOME_PORTAL[sentido]}`;
}

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

/**
 * "Sempre liberado" com horário explícito de 24 h (todos os dias e feriados) em vez de regra sem
 * horário: a spec (§8.3) marca como não validado o comportamento de regra sem access_rule_time_zones.
 */
export function spansDiaInteiro(timeZoneId: number) {
  return [
    {
      time_zone_id: timeZoneId,
      start: 0,
      end: 86399,
      sun: 1,
      mon: 1,
      tue: 1,
      wed: 1,
      thu: 1,
      fri: 1,
      sat: 1,
      hol1: 1,
      hol2: 1,
      hol3: 1,
    },
  ];
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
    let alvo = idConhecido ? linhas.find((l) => mesmoId(l.id, idConhecido)) : undefined;
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

  async function garantirRegra(idConhecido: string | undefined, nome: string): Promise<number> {
    if (idConhecido) {
      const [existente] = await carregar('access_rules', { id: Number(idConhecido) });
      if (existente?.id != null) {
        if (String(existente.name ?? '') !== nome) await renomear('access_rules', Number(existente.id), nome);
        return Number(existente.id);
      }
    }
    const [id] = await criar('access_rules', [{ name: nome, type: 1, priority: 0 }]);
    if (!Number.isFinite(id)) throw new Error(`Falha ao criar a regra "${nome}"`);
    return id;
  }

  /** Remove regra (vínculos + regra) e horário (intervalos + horário) de um sentido. Só ids conhecidos. */
  async function removerRegra(ref?: ControlIdRuleRef): Promise<void> {
    if (ref?.accessRuleId) {
      const id = Number(ref.accessRuleId);
      await apagar('access_rule_time_zones', { access_rule_id: id });
      await apagar('portal_access_rules', { access_rule_id: id });
      await apagar('group_access_rules', { access_rule_id: id });
      await apagar('access_rules', { id });
    }
    if (ref?.timeZoneId) {
      const id = Number(ref.timeZoneId);
      await apagar('time_spans', { time_zone_id: id });
      await apagar('time_zones', { id });
    }
  }

  async function resolverGrupoId(ref: ControlIdAccessGroupRef, nome?: string): Promise<number | null> {
    const grupos = await carregar('groups');
    const porId = ref.groupId ? grupos.find((g) => mesmoId(g.id, ref.groupId)) : undefined;
    const g = porId ?? (nome ? grupos.find((l) => norm(l.name) === norm(nome)) : undefined);
    return g?.id != null ? Number(g.id) : null;
  }

  const paraPortal = (p: Linha) => ({
    id: String(p.id),
    nome: String(p.name ?? ''),
    areaFromId: p.area_from_id != null ? String(p.area_from_id) : null,
    areaToId: p.area_to_id != null ? String(p.area_to_id) : null,
  });
  const paraArea = (a: Linha) => ({ id: String(a.id), nome: String(a.name ?? '') });

  /**
   * §6.1–6.2 + §8.2: cria (ou reconhece) as duas áreas e os dois portais de sentido e replica nos
   * portais novos as regras gerais já ligadas a portais pré-existentes — assim quem não é de turma
   * (grupos padrão, "Sempre Liberado") continua passando nos dois sentidos. Idempotente.
   */
  async function prepareDirection() {
    const criados = { areas: 0, portais: 0 };
    let areas = await carregar('areas');
    const areaId = async (sentido: ControlIdSentido) => {
      const achada = areas.find((a) => norm(a.name) === norm(NOME_AREA[sentido]));
      if (achada?.id != null) return String(achada.id);
      const [id] = await criar('areas', [{ name: NOME_AREA[sentido] }]);
      criados.areas++;
      areas = await carregar('areas');
      const nova = Number.isFinite(id) ? id : areas.find((a) => norm(a.name) === norm(NOME_AREA[sentido]))?.id;
      if (nova == null) throw new Error(`Área "${NOME_AREA[sentido]}" criada, mas o id não foi encontrado`);
      return String(nova);
    };
    const areaInternaId = await areaId('interna');
    const areaExternaId = await areaId('externa');

    const portaisAntes = await carregar('portals');
    const ehPortal = (p: Linha, de: string, para: string) => mesmoId(p.area_from_id, de) && mesmoId(p.area_to_id, para);
    const portalId = async (sentido: ControlIdSentido) => {
      const [de, para] = sentido === 'interna' ? [areaExternaId, areaInternaId] : [areaInternaId, areaExternaId];
      const achado = portaisAntes.find((p) => ehPortal(p, de, para));
      if (achado?.id != null) return String(achado.id);
      const [id] = await criar('portals', [{ name: NOME_PORTAL[sentido], area_from_id: Number(de), area_to_id: Number(para) }]);
      criados.portais++;
      const novo = Number.isFinite(id) ? id : (await carregar('portals')).find((p) => ehPortal(p, de, para))?.id;
      if (novo == null) throw new Error(`Portal "${NOME_PORTAL[sentido]}" criado, mas o id não foi encontrado`);
      return String(novo);
    };
    const portalInternaId = await portalId('interna');
    const portalExternaId = await portalId('externa');

    const preexistentes = portaisAntes.filter(
      (p) => !mesmoId(p.id, portalInternaId) && !mesmoId(p.id, portalExternaId),
    );
    const regrasGerais = new Set<number>();
    for (const p of preexistentes) {
      for (const v of await carregar('portal_access_rules', { portal_id: Number(p.id) })) {
        if (v.access_rule_id != null) regrasGerais.add(Number(v.access_rule_id));
      }
    }
    let regrasReplicadas = 0;
    for (const regra of regrasGerais) {
      const ligados = new Set((await carregar('portal_access_rules', { access_rule_id: regra })).map((v) => String(v.portal_id)));
      const faltando = [portalInternaId, portalExternaId].filter((p) => !ligados.has(p));
      if (faltando.length) {
        await criar('portal_access_rules', faltando.map((portal_id) => ({ portal_id: Number(portal_id), access_rule_id: regra })));
        regrasReplicadas++;
      }
    }

    return {
      areaInternaId,
      areaExternaId,
      portalInternaId,
      portalExternaId,
      criados,
      portaisPreexistentes: preexistentes.map(paraPortal),
      regrasReplicadas,
    };
  }

  async function readDirection() {
    return { areas: (await carregar('areas')).map(paraArea), portais: (await carregar('portals')).map(paraPortal) };
  }

  async function sync(
    grupo: ControlIdAccessGroup,
    ref: ControlIdAccessGroupRef | undefined,
    portais: ControlIdPortals,
  ): Promise<ControlIdAccessGroupRef> {
    const disponiveis = await carregar('portals');
    for (const sentido of SENTIDOS_CONTROLID) {
      if (!disponiveis.some((p) => mesmoId(p.id, portais[sentido]))) {
        throw new Error(`Portal de ${NOME_PORTAL[sentido]} (id ${portais[sentido]}) não existe no equipamento — prepare as áreas novamente`);
      }
    }

    const groupId = await garantirPorNome('groups', grupo.nome, ref?.groupId);
    const saida: ControlIdAccessGroupRef = { groupId: String(groupId) };
    const regrasDoPerfil = new Set<number>();

    for (const sentido of SENTIDOS_CONTROLID) {
      const cfg = grupo[sentido];
      const anterior = ref?.[sentido];

      if (cfg.modo === 'bloqueado') {
        // allow-only: sem regra de permissão nesse portal, ninguém do departamento passa.
        await removerRegra(anterior);
        saida[sentido] = {};
        continue;
      }

      const ruleId = await garantirRegra(anterior?.accessRuleId, nomeRegra(grupo.nome, sentido));
      regrasDoPerfil.add(ruleId);

      const doGrupo = await carregar('group_access_rules', { group_id: groupId, access_rule_id: ruleId });
      if (!doGrupo.length) await criar('group_access_rules', [{ group_id: groupId, access_rule_id: ruleId }]);

      // Exatamente um portal: o do sentido.
      const ligados = await carregar('portal_access_rules', { access_rule_id: ruleId });
      for (const v of ligados) {
        if (!mesmoId(v.portal_id, portais[sentido])) {
          await apagar('portal_access_rules', { access_rule_id: ruleId, portal_id: Number(v.portal_id) });
        }
      }
      if (!ligados.some((v) => mesmoId(v.portal_id, portais[sentido]))) {
        await criar('portal_access_rules', [{ portal_id: Number(portais[sentido]), access_rule_id: ruleId }]);
      }

      const timeZoneId = await garantirPorNome('time_zones', nomeHorario(grupo.codigo, sentido, grupo.nome), anterior?.timeZoneId);
      await apagar('time_spans', { time_zone_id: timeZoneId });
      const spans = cfg.modo === 'livre' ? spansDiaInteiro(timeZoneId) : paraTimeSpans(cfg.dias ?? [], timeZoneId);
      if (spans.length) await criar('time_spans', spans);

      await apagar('access_rule_time_zones', { access_rule_id: ruleId });
      await criar('access_rule_time_zones', [{ access_rule_id: ruleId, time_zone_id: timeZoneId }]);

      saida[sentido] = { accessRuleId: String(ruleId), timeZoneId: String(timeZoneId) };
    }

    // Regras que não são mais do perfil (ex.: formato anterior, com uma regra em todos os portais).
    for (const v of await carregar('group_access_rules', { group_id: groupId })) {
      const regra = Number(v.access_rule_id);
      if (regrasDoPerfil.has(regra)) continue;
      const nossaAnterior = SENTIDOS_CONTROLID.some((s) => mesmoId(ref?.[s]?.accessRuleId, regra));
      if (nossaAnterior) {
        await removerRegra({ accessRuleId: String(regra) });
      } else {
        await apagar('group_access_rules', { group_id: groupId, access_rule_id: regra });
      }
    }

    return saida;
  }

  async function countMembers(ref: ControlIdAccessGroupRef, nome?: string): Promise<number> {
    const groupId = await resolverGrupoId(ref, nome);
    if (groupId == null) return 0;
    return (await carregar('user_groups', { group_id: groupId })).length;
  }

  /** Remove departamento, regras e horários dos dois sentidos. Chamar apenas com o grupo vazio. */
  async function remove(ref: ControlIdAccessGroupRef, nome?: string): Promise<void> {
    for (const sentido of SENTIDOS_CONTROLID) await removerRegra(ref[sentido]);
    const groupId = await resolverGrupoId(ref, nome);
    if (groupId != null) {
      await apagar('group_access_rules', { group_id: groupId });
      await apagar('groups', { id: groupId });
    }
  }

  async function list(): Promise<Array<{ id: string; nome: string }>> {
    return (await carregar('groups'))
      .filter((g) => g.id != null)
      .map((g) => ({ id: String(g.id), nome: String(g.name ?? '') }));
  }

  /** O que está gravado no equipamento para o departamento: regras, portais, horários e intervalos. */
  async function inspect(ref: ControlIdAccessGroupRef, nome: string) {
    const [areas, portais] = [(await carregar('areas')).map(paraArea), (await carregar('portals')).map(paraPortal)];
    const groupId = await resolverGrupoId(ref, nome);
    if (groupId == null) return { encontrado: false, grupo: null, membros: 0, areas, portais, regras: [] };

    const [grupo] = await carregar('groups', { id: groupId });
    const membros = (await carregar('user_groups', { group_id: groupId })).length;
    const regras: Array<{
      id: string;
      nome: string;
      tipo: number;
      portais: string[];
      horarios: Array<{ id: string; nome: string; spans: Array<{ start: number; end: number; dias: number[]; feriados: number[] }> }>;
    }> = [];
    for (const v of await carregar('group_access_rules', { group_id: groupId })) {
      const ruleId = Number(v.access_rule_id);
      const [regra] = await carregar('access_rules', { id: ruleId });
      if (!regra) continue;
      const portaisRegra = (await carregar('portal_access_rules', { access_rule_id: ruleId })).map((p) => String(p.portal_id));
      const horarios: Array<{ id: string; nome: string; spans: Array<{ start: number; end: number; dias: number[]; feriados: number[] }> }> = [];
      for (const link of await carregar('access_rule_time_zones', { access_rule_id: ruleId })) {
        const tzId = Number(link.time_zone_id);
        const [tz] = await carregar('time_zones', { id: tzId });
        const spans = (await carregar('time_spans', { time_zone_id: tzId })).map((s) => ({
          start: Number(s.start),
          end: Number(s.end),
          dias: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => Number(s[d] ?? 0)),
          feriados: ['hol1', 'hol2', 'hol3'].map((h) => Number(s[h] ?? 0)),
        }));
        horarios.push({ id: String(tzId), nome: String(tz?.name ?? ''), spans });
      }
      regras.push({ id: String(ruleId), nome: String(regra.name ?? ''), tipo: Number(regra.type ?? 1), portais: portaisRegra, horarios });
    }

    return {
      encontrado: true,
      grupo: { id: String(groupId), nome: String(grupo?.name ?? nome) },
      membros,
      areas,
      portais,
      regras,
    };
  }

  return { prepareDirection, readDirection, sync, countMembers, remove, list, inspect };
}
