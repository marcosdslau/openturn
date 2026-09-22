// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/hardware/brands/controlid/access-group/controlid-access-config.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/**
 * Leitura da configuração de acesso do Control iD: áreas, portais, horários, departamentos e
 * regras, com os vínculos entre eles. É a base do espelho (fase 1 do plano em
 * docs/controle-por-turma/PLANO-IMPLEMENTACAO.md) — só lê, nunca escreve.
 *
 * FONTE DA VERDADE em webapi/src/hardware/brands/controlid/access-group. O worker recebe uma cópia
 * gerada no build (`npm run shared:sync`) — não edite a cópia.
 *
 * Encadeamento no equipamento (docs/controle-por-turma/README.md §1):
 *
 *   groups ─group_access_rules─> access_rules ─portal_access_rules─> portals (area_from → area_to)
 *                                     └─access_rule_time_zones─> time_zones ─> time_spans
 *
 * O portal é quem carrega o SENTIDO: liberar a entrada numa área é ligar a regra ao portal cuja
 * `area_to` é essa área. Nem a regra nem o departamento têm sentido próprio.
 */

import { criarObjetos, norm, type ControlIdPost, type Linha } from './controlid-objects';

/** Intervalo como o equipamento guarda: segundos desde 00:00, com 86399 = fim do dia. */
export interface ControlIdSpan {
  start: number;
  end: number;
  /** dom..sab, 0/1 */
  dias: number[];
  /** hol1..hol3, 0/1 */
  feriados: number[];
}

export interface ControlIdArea {
  id: string;
  nome: string;
}

export interface ControlIdPortal {
  id: string;
  nome: string;
  /** Quem passa SAI desta área. */
  areaFromId: string | null;
  /** …e ENTRA nesta. É o que define o sentido. */
  areaToId: string | null;
}

export interface ControlIdHorario {
  id: string;
  nome: string;
  spans: ControlIdSpan[];
}

export interface ControlIdGrupo {
  id: string;
  nome: string;
}

export interface ControlIdRegra {
  id: string;
  nome: string;
  /** 1 = permissão, 0 = bloqueio. O projeto é allow-only: bloqueios são reportados, nunca criados. */
  tipo: number;
  horarioIds: string[];
  portalIds: string[];
  grupoIds: string[];
}

/** Intervalo a gravar: segundos desde 00:00 e os dias em que vale. */
export interface ControlIdSpanEntrada {
  start: number;
  end: number;
  /** dom..sab */
  dias: boolean[];
  /** hol1..hol3 */
  feriados?: boolean[];
}

/** Retrato completo da configuração de acesso de um equipamento. */
export interface ControlIdSnapshot {
  areas: ControlIdArea[];
  portais: ControlIdPortal[];
  horarios: ControlIdHorario[];
  grupos: ControlIdGrupo[];
  regras: ControlIdRegra[];
}

const DIAS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const FERIADOS = ['hol1', 'hol2', 'hol3'] as const;

const id = (v: unknown) => String(v);
const nome = (l: Linha) => String(l.name ?? '');
const idOuNulo = (v: unknown) => (v != null ? String(v) : null);

/** Agrupa linhas de uma tabela de vínculo: chave → lista de ids do outro lado. */
function agrupar(linhas: Linha[], de: string, para: string): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const l of linhas) {
    if (l[de] == null || l[para] == null) continue;
    const chave = String(l[de]);
    const lista = mapa.get(chave) ?? [];
    lista.push(String(l[para]));
    mapa.set(chave, lista);
  }
  return mapa;
}

export function createControlIdAccessConfig(post: ControlIdPost) {
  const { carregar, criar, apagar, renomear } = criarObjetos(post);

  /**
   * Lê tudo em 9 chamadas (uma por tabela) e monta os vínculos em memória — em vez de uma consulta
   * por regra, que numa catraca com dezenas de departamentos vira centenas de round-trips.
   */
  async function readAll(): Promise<ControlIdSnapshot> {
    const [areas, portais, horarios, grupos, regras, spans, regraHorarios, regraPortais, grupoRegras] = await Promise.all([
      carregar('areas'),
      carregar('portals'),
      carregar('time_zones'),
      carregar('groups'),
      carregar('access_rules'),
      carregar('time_spans'),
      carregar('access_rule_time_zones'),
      carregar('portal_access_rules'),
      carregar('group_access_rules'),
    ]);

    const spansPorHorario = new Map<string, ControlIdSpan[]>();
    for (const s of spans) {
      if (s.time_zone_id == null) continue;
      const chave = String(s.time_zone_id);
      const lista = spansPorHorario.get(chave) ?? [];
      lista.push({
        start: Number(s.start ?? 0),
        end: Number(s.end ?? 0),
        dias: DIAS.map((d) => Number(s[d] ?? 0)),
        feriados: FERIADOS.map((h) => Number(s[h] ?? 0)),
      });
      spansPorHorario.set(chave, lista);
    }

    const horariosDaRegra = agrupar(regraHorarios, 'access_rule_id', 'time_zone_id');
    const portaisDaRegra = agrupar(regraPortais, 'access_rule_id', 'portal_id');
    const gruposDaRegra = agrupar(grupoRegras, 'access_rule_id', 'group_id');

    return {
      areas: areas.filter((a) => a.id != null).map((a) => ({ id: id(a.id), nome: nome(a) })),
      portais: portais
        .filter((p) => p.id != null)
        .map((p) => ({
          id: id(p.id),
          nome: nome(p),
          areaFromId: idOuNulo(p.area_from_id),
          areaToId: idOuNulo(p.area_to_id),
        })),
      horarios: horarios
        .filter((h) => h.id != null)
        .map((h) => ({ id: id(h.id), nome: nome(h), spans: spansPorHorario.get(String(h.id)) ?? [] })),
      grupos: grupos.filter((g) => g.id != null).map((g) => ({ id: id(g.id), nome: nome(g) })),
      regras: regras
        .filter((r) => r.id != null)
        .map((r) => ({
          id: id(r.id),
          nome: nome(r),
          tipo: Number(r.type ?? 1),
          horarioIds: horariosDaRegra.get(String(r.id)) ?? [],
          portalIds: portaisDaRegra.get(String(r.id)) ?? [],
          grupoIds: gruposDaRegra.get(String(r.id)) ?? [],
        })),
    };
  }

  /**
   * Cria e devolve o id. Alguns firmwares respondem sem `ids`; nesse caso relê pelo nome. Vale só
   * para tabelas com objeto próprio (`areas`, `portals`, `time_zones`) — nunca para vínculo.
   */
  async function criarComId(
    object: 'areas' | 'portals' | 'time_zones' | 'groups' | 'access_rules',
    values: Record<string, unknown>,
  ): Promise<string> {
    const [id] = await criar(object, [values]);
    if (Number.isFinite(id)) return String(id);
    const nome = String(values.name ?? '');
    const achado = (await carregar(object)).find((l) => norm(l.name) === norm(nome));
    if (achado?.id == null) throw new Error(`"${nome}" foi criado em ${object}, mas o id não voltou do equipamento`);
    return String(achado.id);
  }

  const criarArea = (nome: string) => criarComId('areas', { name: nome });

  const renomearArea = async (id: string, nome: string) => {
    await renomear('areas', Number(id), nome);
  };

  /** O portal é a aresta dirigida: quem passa sai de `areaFromId` e ENTRA em `areaToId`. */
  const criarPortal = (nome: string, areaFromId: string, areaToId: string) =>
    criarComId('portals', { name: nome, area_from_id: Number(areaFromId), area_to_id: Number(areaToId) });

  const criarHorario = (nome: string) => criarComId('time_zones', { name: nome });

  const renomearHorario = async (id: string, nome: string) => {
    await renomear('time_zones', Number(id), nome);
  };

  /** Substitui os intervalos do horário. `end` é limitado a 86399, o "fim do dia" do firmware. */
  async function substituirIntervalos(timeZoneId: string, spans: ControlIdSpanEntrada[]): Promise<void> {
    await apagar('time_spans', { time_zone_id: Number(timeZoneId) });
    if (!spans.length) return;
    await criar(
      'time_spans',
      spans.map((s) => ({
        time_zone_id: Number(timeZoneId),
        start: Math.max(0, Math.min(Math.round(s.start), 86399)),
        end: Math.max(0, Math.min(Math.round(s.end), 86399)),
        sun: s.dias[0] ? 1 : 0,
        mon: s.dias[1] ? 1 : 0,
        tue: s.dias[2] ? 1 : 0,
        wed: s.dias[3] ? 1 : 0,
        thu: s.dias[4] ? 1 : 0,
        fri: s.dias[5] ? 1 : 0,
        sat: s.dias[6] ? 1 : 0,
        hol1: s.feriados?.[0] ? 1 : 0,
        hol2: s.feriados?.[1] ? 1 : 0,
        hol3: s.feriados?.[2] ? 1 : 0,
      })),
    );
  }

  /**
   * Remove o horário e seus intervalos. Não mexe em `access_rule_time_zones`: se alguma regra ainda
   * usa o horário, quem chama deve barrar antes — apagar aqui daria FOREIGN KEY constraint failed
   * (README §6.2), e remover o vínculo por conta própria mudaria silenciosamente quem passa.
   */
  async function removerHorario(timeZoneId: string): Promise<void> {
    await apagar('time_spans', { time_zone_id: Number(timeZoneId) });
    await apagar('time_zones', { id: Number(timeZoneId) });
  }

  // ── departamentos e regras ─────────────────────────────────────────────

  const criarGrupo = (nome: string) => criarComId('groups', { name: nome });

  const renomearGrupo = async (id: string, nome: string) => {
    await renomear('groups', Number(id), nome);
  };

  /** Regra de PERMISSÃO. O projeto é allow-only: `type: 0` (bloqueio) nunca é criado aqui. */
  const criarRegra = (nome: string) => criarComId('access_rules', { name: nome, type: 1, priority: 0 });

  const renomearRegra = async (id: string, nome: string) => {
    await renomear('access_rules', Number(id), nome);
  };

  /**
   * Substitui os horários da regra. Apagar e recriar o VÍNCULO é seguro — o que não pode é
   * encadear o id devolvido aqui como se fosse id de regra (README §6.1).
   */
  async function definirHorariosDaRegra(regraId: string, horarioIds: string[]): Promise<void> {
    await apagar('access_rule_time_zones', { access_rule_id: Number(regraId) });
    if (!horarioIds.length) return;
    await criar(
      'access_rule_time_zones',
      horarioIds.map((id) => ({ access_rule_id: Number(regraId), time_zone_id: Number(id) })),
    );
  }

  /**
   * Substitui os portais da regra — é ISTO que define em que sentido ela vale. Regra sem portal
   * não libera nada; regra no portal errado libera o sentido errado sem o equipamento reclamar
   * (README §6.3).
   */
  async function definirPortaisDaRegra(regraId: string, portalIds: string[]): Promise<void> {
    await apagar('portal_access_rules', { access_rule_id: Number(regraId) });
    if (!portalIds.length) return;
    await criar(
      'portal_access_rules',
      portalIds.map((id) => ({ portal_id: Number(id), access_rule_id: Number(regraId) })),
    );
  }

  /** Idempotente: só cria o vínculo se ele ainda não existir. */
  async function ligarRegraAoGrupo(grupoId: string, regraId: string): Promise<void> {
    const ja = await carregar('group_access_rules', { group_id: Number(grupoId), access_rule_id: Number(regraId) });
    if (ja.length) return;
    await criar('group_access_rules', [{ group_id: Number(grupoId), access_rule_id: Number(regraId) }]);
  }

  /** Vínculos primeiro, regra depois — a ordem do §7 do runbook, por causa das chaves estrangeiras. */
  async function removerRegra(regraId: string): Promise<void> {
    const id = Number(regraId);
    await apagar('access_rule_time_zones', { access_rule_id: id });
    await apagar('portal_access_rules', { access_rule_id: id });
    await apagar('group_access_rules', { access_rule_id: id });
    await apagar('access_rules', { id });
  }

  /** Só desfaz o vínculo com o departamento; a regra continua existindo para os outros grupos. */
  async function desligarRegraDoGrupo(grupoId: string, regraId: string): Promise<void> {
    await apagar('group_access_rules', { group_id: Number(grupoId), access_rule_id: Number(regraId) });
  }

  return {
    readAll,
    criarArea,
    renomearArea,
    criarPortal,
    criarHorario,
    renomearHorario,
    substituirIntervalos,
    removerHorario,
    criarGrupo,
    renomearGrupo,
    criarRegra,
    renomearRegra,
    definirHorariosDaRegra,
    definirPortaisDaRegra,
    ligarRegraAoGrupo,
    removerRegra,
    desligarRegraDoGrupo,
  };
}
