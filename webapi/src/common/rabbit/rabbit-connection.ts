import { getDeploymentPrefix } from '../deployment-prefix';

const p = () => getDeploymentPrefix();

export function getJobsExchange()      { return `${p()}_jobs`; }
export function getJobsRetryExchange() { return `${p()}_jobs.retry`; }
export function getJobsDlxExchange()   { return `${p()}_jobs.dlx`; }
export function getJobsDlxQueue()      { return `${p()}_q.rotina.dlq`; }
export function getGlobalRetryQueue()  { return `${p()}_q.rotina.retry`; }
export const RETRY_DLX_ROUTING_KEY = 'retry';

export function getMainQueueName(instituicaoCodigo: number): string {
    return `${p()}_SG_CLI_${instituicaoCodigo}`;
}

export function getRabbitUrl(): string {
    const raw = process.env.RABBIT_URL?.trim();
    if (raw) return raw;
    return 'amqp://guest:guest@localhost:5672';
}
