export const JOBS_EXCHANGE = 'jobs';
export const JOBS_RETRY_EXCHANGE = 'jobs.retry';
export const JOBS_DLX_EXCHANGE = 'jobs.dlx';
export const JOBS_DLX_QUEUE = 'q.rotina.dlq';
/** Uma única fila de delay/retry; roteamento de volta usa republish com routing key = código da instituição. */
export const GLOBAL_RETRY_QUEUE = 'q.rotina.retry';
/** Routing key fixa: filas principais enviam DLX para jobs.retry com esta chave. */
export const RETRY_DLX_ROUTING_KEY = 'retry';
export const INSTITUICAO_REFRESH_CHANNEL = 'openturn:instituicao:queue:refresh';

export function getRabbitUrl(): string {
    const raw = process.env.RABBIT_URL?.trim();
    if (raw) return raw;
    return 'amqp://guest:guest@localhost:5672';
}

export function getMainQueueName(instituicaoCodigo: number): string {
    return `SG_CLI_${instituicaoCodigo}`;
}
