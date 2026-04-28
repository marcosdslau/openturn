import { getDeploymentPrefix } from './deployment-prefix';

/** Prefixo DEV|PRD: OPENTURN_DEPLOYMENT_PREFIX ou NODE_ENV (ex.: NODE_ENV=DEV → DEV). Isola Redis/Rabbit entre ambientes. */
const p = () => getDeploymentPrefix();

// ── Redis keys ──

export function redisPendingKey(exeId: string)         { return `${p()}:rotina:pending:${exeId}`; }
export function redisInflightZkey(instCodigo: number)   { return `${p()}:rotina:inflight:z:${instCodigo}`; }
export function redisSerialInflightZkey(instCodigo: number, rotinaCodigo: number) {
    return `${p()}:rotina:serial:inflight:z:${instCodigo}:${rotinaCodigo}`;
}
export function redisInflightPattern()                  { return `${p()}:rotina:inflight:z:*`; }
export function redisInflightRegex()                    { return new RegExp(`^${p()}:rotina:inflight:z:(\\d+)$`); }

// ── Redis Pub/Sub channels ──

export function channelCancel()                         { return `${p()}:rotina:cancel`; }
export function channelConsole()                        { return `${p()}:rotina:console`; }
export function channelFinished(exeId: string)          { return `${p()}:rotina:finished:${exeId}`; }
export function channelInstituicaoRefresh()             { return `${p()}:openturn:instituicao:queue:refresh`; }
export function channelRotinaRefresh()                  { return `${p()}:openturn:rotina:meta:refresh`; }

/** Chave do cache em memória de ROTPermiteParalelismo no worker (mesmo prefixo de ambiente que Redis). */
export function redisRotinaParalelismoCacheKey(instCodigo: number, rotinaCodigo: number) {
    return `${p()}:${instCodigo}:${rotinaCodigo}`;
}

/** Prefixo para invalidar todas as rotinas de uma instituição nesse cache. */
export function redisRotinaParalelismoCacheInstPrefix(instCodigo: number) {
    return `${p()}:${instCodigo}:`;
}
