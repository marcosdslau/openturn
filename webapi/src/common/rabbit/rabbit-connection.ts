export const JOBS_EXCHANGE = 'jobs';
export const JOBS_DLX_QUEUE = 'q.rotina.dlq';
export const GLOBAL_RETRY_QUEUE = 'q.rotina.retry';
export const INSTITUICAO_REFRESH_CHANNEL = 'openturn:instituicao:queue:refresh';

export function getRabbitUrl(): string {
    const raw = process.env.RABBIT_URL?.trim();
    if (raw) return raw;
    return 'amqp://guest:guest@localhost:5672';
}

export function getMainQueueName(instituicaoCodigo: number): string {
    return `SG_CLI_${instituicaoCodigo}`;
}

