import { getDeploymentPrefix } from './deployment-prefix';

/** Prefixo DEV|PRD: OPENTURN_DEPLOYMENT_PREFIX ou NODE_ENV (ex.: NODE_ENV=DEV → DEV). Isola Redis/Rabbit entre ambientes. */
const p = () => getDeploymentPrefix();

// ── Redis keys ──

export function redisPendingKey(exeId: string)         { return `${p()}:rotina:pending:${exeId}`; }
export function redisInflightZkey(instCodigo: number)   { return `${p()}:rotina:inflight:z:${instCodigo}`; }
export function redisSerialInflightZkey(instCodigo: number, rotinaCodigo: number) {
    return `${p()}:rotina:serial:inflight:z:${instCodigo}:${rotinaCodigo}`;
}
export function redisSerialInflightPattern(instCodigo: number) {
    return `${p()}:rotina:serial:inflight:z:${instCodigo}:*`;
}
/** Lista FIFO de exeId's esperando o lock serial de (instCodigo, rotinaCodigo). */
export function redisSerialWaitKey(instCodigo: number, rotinaCodigo: number) {
    return `${p()}:rotina:serial:wait:${instCodigo}:${rotinaCodigo}`;
}
/**
 * Lista de "claim" (LMOVE a partir da wait list): item que foi retirado da fila de espera e
 * está sendo reconstruído/executado pelo dreno. Existir aqui em vez de sumir direto da wait
 * list é o que permite recuperar o item (voltar para a cabeça da fila) se o worker morrer
 * entre o pop e o término do processamento — ver `reclaimOrphanSerialClaims`.
 */
export function redisSerialProcessingKey(instCodigo: number, rotinaCodigo: number) {
    return `${p()}:rotina:serial:processing:${instCodigo}:${rotinaCodigo}`;
}
/** Contador de tentativas falhas (INCR + TTL) de um exeId específico numa rotina serial. */
export function redisSerialAttemptsKey(instCodigo: number, rotinaCodigo: number, exeId: string) {
    return `${p()}:rotina:serial:attempts:${instCodigo}:${rotinaCodigo}:${exeId}`;
}
/** SET durável (sobrevive a restart) de pares "inst:rotina" que já tiveram fila de espera serial — substitui o antigo Set em memória. */
export function redisSerialPairsKey() { return `${p()}:rotina:serial:pairs`; }
export function redisSerialWaitPattern() { return `${p()}:rotina:serial:wait:*`; }
export function redisSerialProcessingPattern() { return `${p()}:rotina:serial:processing:*`; }
export function redisSerialWaitRegex() { return new RegExp(`^${p()}:rotina:serial:wait:(\\d+):(\\d+)$`); }
export function redisSerialProcessingRegex() { return new RegExp(`^${p()}:rotina:serial:processing:(\\d+):(\\d+)$`); }
/** Lock distribuído (SET NX PX) contra execução dupla do mesmo exeId em instâncias diferentes do worker. */
export function redisRunningLockKey(exeId: string) { return `${p()}:rotina:running:${exeId}`; }
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
