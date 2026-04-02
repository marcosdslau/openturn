export const JOBS_EXCHANGE = 'jobs';
export const INSTITUICAO_REFRESH_CHANNEL = 'openturn:instituicao:queue:refresh';

export function getRabbitUrl(): string {
    const raw = process.env.RABBIT_URL?.trim();
    console.log('raw rabbit url', raw);
    if (raw) return raw;
    return 'amqp://guest:guest@localhost:5672';
}

