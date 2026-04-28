import { getDeploymentPrefix } from '../deployment-prefix';

/** Prefixo DEV|PRD: OPENTURN_DEPLOYMENT_PREFIX ou NODE_ENV (ex.: NODE_ENV=DEV → DEV). Isola Redis/Rabbit entre ambientes. */
const p = () => getDeploymentPrefix();

// ── Redis keys ──

export function redisPendingKey(exeId: string) {
  return `${p()}:rotina:pending:${exeId}`;
}
export function redisInflightZkey(instCodigo: number) {
  return `${p()}:rotina:inflight:z:${instCodigo}`;
}
export function redisSerialInflightZkey(
  instCodigo: number,
  rotinaCodigo: number,
) {
  return `${p()}:rotina:serial:inflight:z:${instCodigo}:${rotinaCodigo}`;
}
export function redisInflightPattern() {
  return `${p()}:rotina:inflight:z:*`;
}
/** Regex to extract instituicaoCodigo from prefixed inflight key. */
export function redisInflightRegex() {
  return new RegExp(`^${p()}:rotina:inflight:z:(\\d+)$`);
}
export function redisCronLockKey(rotinaId: number) {
  return `${p()}:cron-lock:${rotinaId}:${Math.floor(Date.now() / 60000)}`;
}

export function redisMonitorSnapshot() {
  return `${p()}:monitor:global:snapshot:v1`;
}
export function redisMonitorRefreshLock() {
  return `${p()}:monitor:global:snapshot:refresh:lock`;
}
export function redisMonitorInstDashboard(instCodigo: number) {
  return `${p()}:monitor:instituicao:${instCodigo}:dashboard:v1`;
}
export function redisMonitorInstDashboardPattern() {
  return `${p()}:monitor:instituicao:*:dashboard:v1`;
}

// ── Redis Pub/Sub channels ──

export function channelCancel() {
  return `${p()}:rotina:cancel`;
}
export function channelConsole() {
  return `${p()}:rotina:console`;
}
export function channelFinished(exeId: string) {
  return `${p()}:rotina:finished:${exeId}`;
}
export function channelInstituicaoRefresh() {
  return `${p()}:openturn:instituicao:queue:refresh`;
}
export function channelRotinaRefresh() {
  return `${p()}:openturn:rotina:meta:refresh`;
}

// ── Socket.IO adapter key prefix ──

export function socketIoKeyPrefix() {
  return `${p()}:socket.io`;
}
