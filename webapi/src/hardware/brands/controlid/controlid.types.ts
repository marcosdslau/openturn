import type { WsRelayGateway } from '../../../connector/ws-relay.gateway';

/** Contexto para abrir HTTP em outros hosts do mesmo equipamento quando usa addon (relay). */
export type ControlIdRelayMultiHostContext = {
  wsRelay: WsRelayGateway;
  connectorCodigo: number;
  equipmentId: number;
};

/** Modelos ControlID suportados pela factory (normalização em `normalizeControlIdModel`). */
export enum ControlIDModel {
  IDBLOCK = 'IDBLOCK',
  IDBLOCK_NEXT = 'IDBLOCK_NEXT',
  IDBLOCK_FACIAL = 'IDBLOCK_FACIAL',
  IDFACEMAX = 'IDFACEMAX',
  IDFACE = 'IDFACE',
  DEFAULT = 'DEFAULT',
}

export enum ControlIDMode {
  STANDALONE = 'standalone',
  ONLINE_PRO = 'pro',
  ONLINE_ENTERPRISE = 'enterprise',
}

/** Sentido de entrada no cadastro (agnóstico de fabricante). */
export type EntrySide = 'left' | 'right';

/** Campo do equipamento que casou com `device_id` do webhook ControlID Monitor. */
export type ControlidDeviceMatchField =
  | 'EQPDeviceId'
  | 'EQPConfig.deviceId'
  | 'EQPConfig.deviceId_entry'
  | 'EQPConfig.deviceId_exit'
  | 'EQPConfig.onlineServerId'
  | 'legacy_EQPCodigo';

export interface ControlIDConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  mode: ControlIDMode;
  model?: string;
  rotation_type?:
    | 'both_controlled'
    | 'entry_free_exit_controlled'
    | 'entry_controlled_exit_free'
    | 'both_free';
  entry_side?: EntrySide;
  entry_direction_applied_by_equipment?: boolean;
  entry_direction?: 'clockwise' | 'counter_clockwise';
  anti_double_entry?: 'active' | 'inactive';
  door_id?: number | string;
  /** @deprecated Prefira `deviceId`. */
  onlineServerId?: string;
  deviceId?: string;
  ip_entry?: string;
  deviceId_entry?: string;
  ip_exit?: string;
  deviceId_exit?: string;
}

/** De onde saiu o host com que o provider fala. `EQPEnderecoIp` é o ÚLTIMO fallback, não o primeiro. */
export type OrigemHostControlId =
  | 'override'
  | 'EQPConfig.host'
  | 'EQPConfig.ip_entry'
  | 'EQPConfig.ip_exit'
  | 'EQPEnderecoIp';

export interface HostControlId {
  host: string;
  origem: OrigemHostControlId;
}

/**
 * Precedência do host, única no projeto: a factory usa para instanciar o provider e o diagnóstico
 * usa para dizer na tela com quem está falando. Duplicar isso já significou a tela rotular de
 * "Principal" um host diferente do que o provider de fato usava.
 */
export function resolverHostControlId(
  cfg: Partial<ControlIDConfig> | null | undefined,
  EQPEnderecoIp: string | null | undefined,
  overrideHost?: string,
): HostControlId | null {
  const c = cfg ?? {};
  const candidatos: HostControlId[] = [
    { host: overrideHost ?? '', origem: 'override' },
    { host: c.host ?? '', origem: 'EQPConfig.host' },
    { host: c.ip_entry ?? '', origem: 'EQPConfig.ip_entry' },
    { host: c.ip_exit ?? '', origem: 'EQPConfig.ip_exit' },
    { host: EQPEnderecoIp ?? '', origem: 'EQPEnderecoIp' },
  ];
  return candidatos.find((x) => x.host.trim()) ?? null;
}

/** Todos os hosts conhecidos do equipamento, sem repetir, na ordem da precedência. */
export function hostsControlId(
  cfg: Partial<ControlIDConfig> | null | undefined,
  EQPEnderecoIp: string | null | undefined,
): HostControlId[] {
  const c = cfg ?? {};
  const brutos: HostControlId[] = [
    { host: c.host ?? '', origem: 'EQPConfig.host' },
    { host: c.ip_entry ?? '', origem: 'EQPConfig.ip_entry' },
    { host: c.ip_exit ?? '', origem: 'EQPConfig.ip_exit' },
    { host: EQPEnderecoIp ?? '', origem: 'EQPEnderecoIp' },
  ];
  const vistos = new Set<string>();
  const saida: HostControlId[] = [];
  for (const h of brutos) {
    const chave = h.host.trim().toLowerCase();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ host: h.host.trim(), origem: h.origem });
  }
  return saida;
}

export function normalizeControlIdModel(
  raw: string | null | undefined,
): ControlIDModel {
  const s = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (s.includes('idblocknext') || s === 'idblocknext')
    return ControlIDModel.IDBLOCK_NEXT;
  if (s.includes('idblockfacial') || s === 'idblockfacial')
    return ControlIDModel.IDBLOCK_FACIAL;
  if (s.includes('idfacemax') || s === 'idfacemax')
    return ControlIDModel.IDFACEMAX;
  if (s.includes('idface') && !s.includes('idfacemax'))
    return ControlIDModel.IDFACE;
  if (s.includes('idblock')) return ControlIDModel.IDBLOCK;
  return ControlIDModel.DEFAULT;
}
