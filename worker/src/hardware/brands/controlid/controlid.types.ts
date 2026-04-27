import type { WsRelayClient } from '../../relay/ws-relay-client';

/** Contexto para abrir HTTP em outros hosts do mesmo equipamento quando usa addon (relay). */
export type ControlIdRelayMultiHostContext = {
  wsRelay: WsRelayClient;
  /** Instituição — o gateway roteia HTTP_REQUEST por tenantId. */
  instituicaoCodigo: number;
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
