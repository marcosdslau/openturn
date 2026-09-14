// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/ports.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { EQPEquipamento } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Intervalo } from './perfil-canonico';

/** Horário já canonizado: 7 posições (dom..sab), intervalos em minutos, meia-noite já dividida. */
export interface HardwareAccessGroup {
  nome: string;
  dias: Intervalo[][];
}

export interface HardwareAccessGroupRef {
  groupId?: string;
  accessRuleId?: string;
  timeZoneId?: string;
}

/** O que cada lado (webapi / worker) injeta para o núcleo falar com o hardware. */
export interface AccessGroupPort {
  suporta(eqp: EQPEquipamento): Promise<boolean>;
  sync(eqp: EQPEquipamento, grupo: HardwareAccessGroup, ref?: HardwareAccessGroupRef): Promise<HardwareAccessGroupRef>;
  remover(eqp: EQPEquipamento, ref: HardwareAccessGroupRef): Promise<void>;
  contarMembros(eqp: EQPEquipamento, ref: HardwareAccessGroupRef): Promise<number>;
  listarGrupos(eqp: EQPEquipamento): Promise<Array<{ id: string; nome: string }>>;
}

/** Subconjunto dos métodos de IHardwareProvider usados aqui (tipagem estrutural, sem import de hardware/). */
export interface ProviderComGruposDeAcesso {
  supportsAccessGroups?: () => boolean;
  syncAccessGroup?: (equipmentId: number, group: HardwareAccessGroup, ref?: HardwareAccessGroupRef) => Promise<HardwareAccessGroupRef>;
  removeAccessGroup?: (equipmentId: number, ref: HardwareAccessGroupRef) => Promise<void>;
  countAccessGroupMembers?: (equipmentId: number, ref: HardwareAccessGroupRef) => Promise<number>;
  listAccessGroups?: (equipmentId: number) => Promise<Array<{ id: string; nome: string }>>;
}

/**
 * Porta de hardware genérica: cada lado só informa como resolver o provider de um
 * equipamento. Providers são reaproveitados dentro da mesma instância (uma operação).
 */
export function criarAccessGroupPort(
  resolver: (eqp: EQPEquipamento) => Promise<unknown>,
): AccessGroupPort {
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
    async sync(eqp, grupo, ref) {
      return (await exigir(eqp)).syncAccessGroup!(eqp.EQPCodigo, grupo, ref);
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
