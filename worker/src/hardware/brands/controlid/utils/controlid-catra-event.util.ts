import { AcaoPassagem } from '@prisma/client';
import {
  ControlIDConfig,
  ControlidDeviceMatchField,
} from '../controlid.types';

/**
 * Extrai código de giro do payload catra_event ControlID Monitor.
 * Aceita `event` numérico (raiz) ou aninhado em objeto; valores7/8 usados na convenção nativa.
 */
export function extractControlidCatraRotationCode(body: any): number | null {
  const ev = body?.event;
  if (typeof ev === 'number' && !Number.isNaN(ev)) return ev;
  if (ev != null && typeof ev === 'object') {
    const candidates = [ev.event, ev.type, ev.rotation, ev.code];
    for (const c of candidates) {
      if (typeof c === 'number' && !Number.isNaN(c)) return c;
      if (typeof c === 'string' && /^-?\d+$/.test(c.trim()))
        return Number(c.trim());
    }
  }
  const top = body?.rotation ?? body?.catra_rotation;
  if (typeof top === 'number' && !Number.isNaN(top)) return top;
  if (typeof top === 'string' && /^-?\d+$/.test(String(top).trim()))
    return Number(String(top).trim());
  return null;
}

function nativeControlidAcao(rotation: number | null): AcaoPassagem {
  if (rotation === 8) return AcaoPassagem.SAIDA;
  return AcaoPassagem.ENTRADA;
}

/**
 * Determina ENTRADA/SAIDA pelo IP da perna que disparou o evento, identificada
 * via `body.device_id` casando com `EQPConfig.deviceId_entry`/`deviceId_exit`.
 * `rotation` (7 ou 8) é apenas validação de tipo de evento válido — não dita direção.
 *
 * Fallback: quando `device_id` casa com o device principal (`config.deviceId`),
 * compara `config.host` com `config.ip_entry`/`config.ip_exit`. Se nada casar, retorna `null`.
 */
function acaoFromEquipmentEventIp(
  config: ControlIDConfig,
  body: any,
  rotation: number | null,
): AcaoPassagem | null {
  if (rotation !== 7 && rotation !== 8) return null;

  const deviceIdStr = body?.device_id != null ? String(body.device_id) : '';
  if (!deviceIdStr) return null;

  const idEntry = config.deviceId_entry?.trim();
  const idExit = config.deviceId_exit?.trim();
  if (idEntry && deviceIdStr === idEntry) return AcaoPassagem.ENTRADA;
  if (idExit && deviceIdStr === idExit) return AcaoPassagem.SAIDA;

  const idMain = config.deviceId?.trim();
  if (idMain && deviceIdStr === idMain) {
    const host = normalizeControlidHostOrIp(config.host);
    const ipEntry = normalizeControlidHostOrIp(config.ip_entry);
    const ipExit = normalizeControlidHostOrIp(config.ip_exit);
    if (host && ipEntry && host === ipEntry) return AcaoPassagem.ENTRADA;
    if (host && ipExit && host === ipExit) return AcaoPassagem.SAIDA;
  }

  return null;
}

/** Normaliza host/IP para comparação (sem porta, sem protocolo, minúsculas). */
export function normalizeControlidHostOrIp(
  s: string | undefined | null,
): string | null {
  if (s == null || String(s).trim() === '') return null;
  let t = String(s).trim().toLowerCase();
  if (t.includes('://')) {
    try {
      const u = new URL(t.startsWith('http') ? t : `http://${t}`);
      t = u.hostname;
    } catch {
      /* mantém t */
    }
  } else {
    const idx = t.indexOf(':');
    if (idx > 0 && !t.startsWith('[')) {
      const maybePort = t.slice(idx + 1);
      if (/^\d+$/.test(maybePort)) t = t.slice(0, idx);
    }
  }
  return t || null;
}

export type ControlidEquipamentoPrimaryContext = {
  deviceId?: string | null;
  EQPEnderecoIp?: string | null;
};

/**
 * Equipamento primário no cenário iDBlock / leitor duplo:
 * - `device_id` do webhook igual ao `EQPDeviceId` (coluna `deviceId`); ou
 * - Em EQPConfig, a perna cujo IP (`host` para `deviceId`, `ip_entry` / `ip_exit` para os demais)
 *   coincide com `EQPEnderecoIp` do cadastro e cujo Monitor `device_id` é o do evento.
 * Nesses casos não se aplica atalho ENTRADA/SAÍDA por leitor secundário — usa-se giro.
 */
export function isPrimaryControlidCatraDevice(
  deviceIdStr: string,
  config: ControlIDConfig,
  equipment: ControlidEquipamentoPrimaryContext,
): boolean {
  const col = equipment.deviceId?.trim();
  if (col && deviceIdStr === col) return true;

  const eqpIp = normalizeControlidHostOrIp(equipment.EQPEnderecoIp);
  const mainId = config.deviceId?.trim();
  const entryId = config.deviceId_entry?.trim();
  const exitId = config.deviceId_exit?.trim();

  if (!eqpIp) {
    if (!entryId && !exitId && mainId && deviceIdStr === mainId) return true;
    return false;
  }

  const host = normalizeControlidHostOrIp(config.host);
  const ipForMain = host ?? eqpIp;
  if (mainId && deviceIdStr === mainId && ipForMain === eqpIp) return true;

  const ipEntry = normalizeControlidHostOrIp(config.ip_entry);
  if (entryId && deviceIdStr === entryId && ipEntry && ipEntry === eqpIp)
    return true;

  const ipExit = normalizeControlidHostOrIp(config.ip_exit);
  if (exitId && deviceIdStr === exitId && ipExit && ipExit === eqpIp)
    return true;

  return false;
}

/**
 * Leitores duplos: força ENTRADA/SAÍDA só no leitor secundário (device_id ≠ primário).
 * Primário = coluna `deviceId` ou perna do EQPConfig com mesmo IP que `EQPEnderecoIp`.
 */
export function tryDualReaderAcaoPassagem(
  deviceIdStr: string,
  config: ControlIDConfig,
  matchedField: ControlidDeviceMatchField,
  equipment: ControlidEquipamentoPrimaryContext,
): AcaoPassagem | undefined {
  if (isPrimaryControlidCatraDevice(deviceIdStr, config, equipment)) {
    return undefined;
  }

  const entry = config.deviceId_entry?.trim();
  const exit = config.deviceId_exit?.trim();
  const bothDual = !!(entry && exit);

  if (bothDual) {
    if (matchedField === 'EQPConfig.deviceId_entry' && deviceIdStr === entry) {
      return AcaoPassagem.ENTRADA;
    }
    if (matchedField === 'EQPConfig.deviceId_exit' && deviceIdStr === exit) {
      return AcaoPassagem.SAIDA;
    }
    return undefined;
  }

  if (
    entry &&
    matchedField === 'EQPConfig.deviceId_entry' &&
    deviceIdStr === entry
  ) {
    return AcaoPassagem.ENTRADA;
  }
  if (
    exit &&
    matchedField === 'EQPConfig.deviceId_exit' &&
    deviceIdStr === exit
  ) {
    return AcaoPassagem.SAIDA;
  }
  return undefined;
}

export function resolveControlidCatraAcaoPassagem(params: {
  body: any;
  config: ControlIDConfig;
  matchedField: ControlidDeviceMatchField;
  equipamento: ControlidEquipamentoPrimaryContext;
}): AcaoPassagem {
  const deviceIdStr =
    params.body?.device_id != null ? String(params.body.device_id) : '';
  const dual = tryDualReaderAcaoPassagem(
    deviceIdStr,
    params.config,
    params.matchedField,
    params.equipamento,
  );
  if (dual !== undefined) return dual;

  const rotation = extractControlidCatraRotationCode(params.body);
  const applied = params.config.entry_direction_applied_by_equipment === true;

  if (!applied) {
    return nativeControlidAcao(rotation);
  }

  const fromIp = acaoFromEquipmentEventIp(params.config, params.body, rotation);
  if (fromIp != null) return fromIp;

  return nativeControlidAcao(rotation);
}
