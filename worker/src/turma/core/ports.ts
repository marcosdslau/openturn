// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/ports.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { EQPEquipamento } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Intervalo } from './perfil-canonico';
import type { ModoSentido, Sentido } from './tipos';

/** Regra de um sentido já canonizada: dias só em modo 'horario' (7 posições dom..sab, minutos). */
export interface RegraSentidoHardware {
  modo: ModoSentido;
  dias: Intervalo[][] | null;
}

/** Departamento + regra por sentido (SpecControlId.md §5 — modelo allow-only). */
export interface HardwareAccessGroup {
  /** Identificador estável do perfil (PHACodigo) — compõe nomes únicos de horários no equipamento. */
  codigo: string;
  nome: string;
  interna: RegraSentidoHardware;
  externa: RegraSentidoHardware;
}

export interface HardwareRuleRef {
  accessRuleId?: string;
  timeZoneId?: string;
}

export interface HardwareAccessGroupRef {
  groupId?: string;
  interna?: HardwareRuleRef;
  externa?: HardwareRuleRef;
}

/** Portal (id no equipamento) de cada sentido, já considerando a inversão confirmada em bancada. */
export type HardwareDirectionPortals = Record<Sentido, string>;

export interface HostCatraConfig {
  host: string;
  catra_role?: string | null;
  catra_side_to_enter?: string | null;
  catra_default_fsm?: string | null;
  erro?: string;
}

export interface HardwareArea {
  id: string;
  nome: string;
}

export interface HardwarePortal {
  id: string;
  nome: string;
  areaFromId: string | null;
  areaToId: string | null;
}

/** Resultado da preparação de Área Interna/Externa e dos dois portais (SpecControlId.md §6.1–6.2). */
export interface HardwareDirectionSetup {
  areaInternaId: string;
  areaExternaId: string;
  /** area_from = Externa, area_to = Interna (entrar na escola). */
  portalInternaId: string;
  /** area_from = Interna, area_to = Externa (sair da escola). */
  portalExternaId: string;
  criados: { areas: number; portais: number };
  /** Portais que já existiam e não são os de sentido. */
  portaisPreexistentes: HardwarePortal[];
  /** Regras gerais (ex.: "Sempre Liberado" dos grupos padrão) replicadas nos portais de sentido. */
  regrasReplicadas: number;
  catra: HostCatraConfig[];
}

export interface HardwareDirectionReading {
  catra: HostCatraConfig[];
  areas: HardwareArea[];
  portais: HardwarePortal[];
}

export interface HardwareSpan {
  start: number;
  end: number;
  /** dom..sab, 0/1 */
  dias: number[];
  feriados: number[];
}

/** O que está de fato gravado no equipamento para um departamento. */
export interface HardwareAccessGroupInspection {
  encontrado: boolean;
  grupo: { id: string; nome: string } | null;
  membros: number;
  areas: HardwareArea[];
  portais: HardwarePortal[];
  regras: Array<{
    id: string;
    nome: string;
    /** 1 = permissão, 0 = bloqueio */
    tipo: number;
    portais: string[];
    horarios: Array<{ id: string; nome: string; spans: HardwareSpan[] }>;
  }>;
}

/** O que cada lado (webapi / worker) injeta para o núcleo falar com o hardware. */
export interface AccessGroupPort {
  suporta(eqp: EQPEquipamento): Promise<boolean>;
  prepararSentido(eqp: EQPEquipamento): Promise<HardwareDirectionSetup>;
  lerSentido(eqp: EQPEquipamento): Promise<HardwareDirectionReading>;
  sync(
    eqp: EQPEquipamento,
    grupo: HardwareAccessGroup,
    ref: HardwareAccessGroupRef | undefined,
    portais: HardwareDirectionPortals,
  ): Promise<HardwareAccessGroupRef>;
  remover(eqp: EQPEquipamento, ref: HardwareAccessGroupRef): Promise<void>;
  contarMembros(eqp: EQPEquipamento, ref: HardwareAccessGroupRef): Promise<number>;
  listarGrupos(eqp: EQPEquipamento): Promise<Array<{ id: string; nome: string }>>;
  inspecionar(eqp: EQPEquipamento, ref: HardwareAccessGroupRef, nome: string): Promise<HardwareAccessGroupInspection>;
}

/** Subconjunto dos métodos de IHardwareProvider usados aqui (tipagem estrutural, sem import de hardware/). */
export interface ProviderComGruposDeAcesso {
  supportsAccessGroups?: () => boolean;
  prepareAccessDirection?: (device: EQPEquipamento) => Promise<HardwareDirectionSetup>;
  readAccessDirection?: (device: EQPEquipamento) => Promise<HardwareDirectionReading>;
  syncAccessGroup?: (
    equipmentId: number,
    group: HardwareAccessGroup,
    ref: HardwareAccessGroupRef | undefined,
    portals: HardwareDirectionPortals,
  ) => Promise<HardwareAccessGroupRef>;
  removeAccessGroup?: (equipmentId: number, ref: HardwareAccessGroupRef) => Promise<void>;
  countAccessGroupMembers?: (equipmentId: number, ref: HardwareAccessGroupRef) => Promise<number>;
  listAccessGroups?: (equipmentId: number) => Promise<Array<{ id: string; nome: string }>>;
  inspectAccessGroup?: (equipmentId: number, ref: HardwareAccessGroupRef, nome: string) => Promise<HardwareAccessGroupInspection>;
}

/**
 * Porta de hardware genérica: cada lado só informa como resolver o provider de um
 * equipamento. Providers são reaproveitados dentro da mesma instância (uma operação).
 */
export function criarAccessGroupPort(resolver: (eqp: EQPEquipamento) => Promise<unknown>): AccessGroupPort {
  const cache = new Map<number, Promise<ProviderComGruposDeAcesso | null>>();

  const provider = (eqp: EQPEquipamento) => {
    if (!cache.has(eqp.EQPCodigo)) {
      cache.set(
        eqp.EQPCodigo,
        resolver(eqp).then(
          (p) => p as ProviderComGruposDeAcesso,
          () => null, // marca não suportada pela factory ou configuração inválida
        ),
      );
    }
    return cache.get(eqp.EQPCodigo)!;
  };

  const exigir = async (eqp: EQPEquipamento) => {
    const p = await provider(eqp);
    if (!p || typeof p.supportsAccessGroups !== 'function' || !p.supportsAccessGroups()) {
      throw new Error(`Equipamento ${eqp.EQPCodigo} (${eqp.EQPMarca ?? 'sem marca'}) não suporta grupos de acesso`);
    }
    return p;
  };

  return {
    async suporta(eqp) {
      const p = await provider(eqp);
      return !!p && typeof p.supportsAccessGroups === 'function' && p.supportsAccessGroups();
    },
    async prepararSentido(eqp) {
      return (await exigir(eqp)).prepareAccessDirection!(eqp);
    },
    async lerSentido(eqp) {
      return (await exigir(eqp)).readAccessDirection!(eqp);
    },
    async sync(eqp, grupo, ref, portais) {
      return (await exigir(eqp)).syncAccessGroup!(eqp.EQPCodigo, grupo, ref, portais);
    },
    async remover(eqp, ref) {
      await (await exigir(eqp)).removeAccessGroup!(eqp.EQPCodigo, ref);
    },
    async contarMembros(eqp, ref) {
      return (await exigir(eqp)).countAccessGroupMembers!(eqp.EQPCodigo, ref);
    },
    async listarGrupos(eqp) {
      return (await exigir(eqp)).listAccessGroups!(eqp.EQPCodigo);
    },
    async inspecionar(eqp, ref, nome) {
      return (await exigir(eqp)).inspectAccessGroup!(eqp.EQPCodigo, ref, nome);
    },
  };
}

export interface LockPort {
  /** Executa `fn` com o lock; retorna `{ ocupado: true }` sem esperar quando outro processo o detém. */
  comLock<T>(chave: string, ttlMs: number, fn: () => Promise<T>): Promise<{ ocupado: false; valor: T } | { ocupado: true }>;
}

/** Subconjunto do ioredis usado pelo lock. */
export interface RedisParaLock {
  set(...args: any[]): Promise<unknown>;
  eval(...args: any[]): Promise<unknown>;
}

const LIBERAR_SE_DONO = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

/** Lock distribuído SET NX PX, liberado apenas pelo dono (compare-and-delete). */
export function criarLockRedis(redis: RedisParaLock): LockPort {
  return {
    async comLock(chave, ttlMs, fn) {
      const token = randomUUID();
      const ok = await redis.set(chave, token, 'PX', ttlMs, 'NX');
      if (ok !== 'OK') return { ocupado: true };
      try {
        return { ocupado: false, valor: await fn() };
      } finally {
        await redis.eval(LIBERAR_SE_DONO, 1, chave, token).catch(() => undefined);
      }
    },
  };
}

/** Para testes e ambientes sem Redis: serializa por chave dentro do próprio processo. */
export function criarLockEmMemoria(): LockPort {
  const donos = new Set<string>();
  return {
    async comLock(chave, _ttlMs, fn) {
      if (donos.has(chave)) return { ocupado: true };
      donos.add(chave);
      try {
        return { ocupado: false, valor: await fn() };
      } finally {
        donos.delete(chave);
      }
    },
  };
}
