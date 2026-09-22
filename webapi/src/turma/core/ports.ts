import type { EQPEquipamento } from '@prisma/client';
import { randomUUID } from 'crypto';

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

/** Intervalo a gravar no equipamento: segundos desde 00:00 e os dias em que vale. */
export interface HardwareSpanEntrada {
  start: number;
  end: number;
  /** dom..sab */
  dias: boolean[];
  /** hol1..hol3 */
  feriados?: boolean[];
}

/**
 * Escrita na configuração de acesso do equipamento. Operações cruas: quem chama decide a ordem,
 * valida e atualiza o espelho. Departamentos e regras entram na fase 3.
 */
export interface HardwareAccessConfigOps {
  criarArea(nome: string): Promise<string>;
  renomearArea(id: string, nome: string): Promise<void>;
  /** Aresta dirigida: quem passa sai de `areaFromId` e ENTRA em `areaToId`. */
  criarPortal(nome: string, areaFromId: string, areaToId: string): Promise<string>;
  criarHorario(nome: string): Promise<string>;
  renomearHorario(id: string, nome: string): Promise<void>;
  substituirIntervalos(id: string, spans: HardwareSpanEntrada[]): Promise<void>;
  /** Não mexe nos vínculos: barrar horário em uso é responsabilidade de quem chama. */
  removerHorario(id: string): Promise<void>;
  criarGrupo(nome: string): Promise<string>;
  renomearGrupo(id: string, nome: string): Promise<void>;
  /** Regra de PERMISSÃO (`type: 1`). O modelo é allow-only: bloqueio nunca é criado. */
  criarRegra(nome: string): Promise<string>;
  renomearRegra(id: string, nome: string): Promise<void>;
  definirHorariosDaRegra(regraId: string, horarioIds: string[]): Promise<void>;
  /** É o portal que define o SENTIDO da regra — nem o departamento nem a regra têm sentido próprio. */
  definirPortaisDaRegra(regraId: string, portalIds: string[]): Promise<void>;
  ligarRegraAoGrupo(grupoId: string, regraId: string): Promise<void>;
  /** Apaga vínculos e depois a regra, na ordem que as chaves estrangeiras exigem. */
  removerRegra(regraId: string): Promise<void>;
  desligarRegraDoGrupo(grupoId: string, regraId: string): Promise<void>;
}

/** Intervalo como o equipamento guarda: segundos desde 00:00, com 86399 = fim do dia. */
export interface HardwareSpan {
  start: number;
  end: number;
  /** dom..sab, 0/1 */
  dias: number[];
  /** hol1..hol3, 0/1 */
  feriados: number[];
}

/** Horário do equipamento (`time_zones` + `time_spans`) como está gravado. */
export interface HardwareAccessHorario {
  id: string;
  nome: string;
  spans: HardwareSpan[];
}

/** Regra de acesso com seus vínculos, como está gravada no equipamento. */
export interface HardwareAccessRegra {
  id: string;
  nome: string;
  /** 1 = permissão, 0 = bloqueio. */
  tipo: number;
  /** Portais aos quais a regra está ligada — é isto que define em que sentido ela vale. */
  portalIds: string[];
  horarioIds: string[];
  grupoIds: string[];
}

/** Retrato completo da configuração de acesso de um equipamento (base do espelho). */
export interface HardwareAccessSnapshot {
  areas: HardwareArea[];
  portais: HardwarePortal[];
  horarios: HardwareAccessHorario[];
  grupos: Array<{ id: string; nome: string }>;
  regras: HardwareAccessRegra[];
}

/** Um host do equipamento e de onde ele saiu no cadastro. */
export interface HardwareAccessHost {
  host: string;
  /** Campo de origem, ex.: "EQPConfig.ip_entry". `EQPEnderecoIp` é o ÚLTIMO fallback da precedência. */
  origem: string;
  /** true = é com este host que o sistema fala por padrão. */
  efetivo: boolean;
}

/** Retrato lido de um host específico — para comparar se os hosts têm o mesmo banco de objetos. */
export interface HardwareAccessHostSnapshot extends HardwareAccessHost {
  snapshot?: HardwareAccessSnapshot;
  erro?: string;
}

/** O que cada lado (webapi / worker) injeta para o núcleo falar com o hardware. */
export interface AccessGroupPort {
  suporta(eqp: EQPEquipamento): Promise<boolean>;
  /** Retrato completo da configuração de acesso do equipamento. Só lê. */
  lerConfiguracao(eqp: EQPEquipamento): Promise<HardwareAccessSnapshot>;
  /** Operações de escrita na configuração de acesso. */
  configOps(eqp: EQPEquipamento): Promise<HardwareAccessConfigOps>;
  /** Hosts conhecidos do equipamento e qual deles o sistema usa. Não acessa rede. */
  hostsAcesso(eqp: EQPEquipamento): Promise<HardwareAccessHost[]>;
  /** Lê a configuração de acesso de CADA host, para comparar. */
  lerConfiguracaoTodosHosts(eqp: EQPEquipamento): Promise<HardwareAccessHostSnapshot[]>;
}

/** Subconjunto dos métodos de IHardwareProvider usados aqui (tipagem estrutural, sem import de hardware/). */
export interface ProviderComGruposDeAcesso {
  supportsAccessGroups?: () => boolean;
  readAccessConfig?: (equipmentId: number) => Promise<HardwareAccessSnapshot>;
  accessConfigOps?: (equipmentId: number) => HardwareAccessConfigOps;
  accessHosts?: (device: EQPEquipamento) => HardwareAccessHost[];
  readAccessConfigAllHosts?: (device: EQPEquipamento) => Promise<HardwareAccessHostSnapshot[]>;
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
    async lerConfiguracao(eqp) {
      return (await exigir(eqp)).readAccessConfig!(eqp.EQPCodigo);
    },
    async configOps(eqp) {
      return (await exigir(eqp)).accessConfigOps!(eqp.EQPCodigo);
    },
    async hostsAcesso(eqp) {
      const p = await provider(eqp);
      return typeof p?.accessHosts === 'function' ? p.accessHosts(eqp) : [];
    },
    async lerConfiguracaoTodosHosts(eqp) {
      return (await exigir(eqp)).readAccessConfigAllHosts!(eqp);
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
