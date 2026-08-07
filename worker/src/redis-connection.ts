import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { workerLogLine } from './worker-log';

function optionsFromUrl(url: string): RedisOptions {
    try {
        const parsed = new URL(url);
        const opts: RedisOptions = {
            host: parsed.hostname || 'localhost',
            port: parseInt(parsed.port || '6379', 10),
        };
        const user = parsed.username ? decodeURIComponent(parsed.username) : '';
        if (user) opts.username = user;
        if (parsed.password) opts.password = decodeURIComponent(parsed.password);
        return opts;
    } catch {
        return { host: 'localhost', port: 6379 };
    }
}

/** Prefer REDIS_HOST / REDIS_PORT / REDIS_USERNAME / REDIS_PASSWORD; if REDIS_URL is set and REDIS_HOST is not, parse the URL (legacy). */
export function getRedisConnectionOptions(): RedisOptions {
    if (process.env.REDIS_URL && !process.env.REDIS_HOST) {
        return optionsFromUrl(process.env.REDIS_URL);
    }
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const opts: RedisOptions = { host, port };
    if (process.env.REDIS_USERNAME) {
        opts.username = process.env.REDIS_USERNAME;
    }
    if (process.env.REDIS_PASSWORD !== undefined && process.env.REDIS_PASSWORD !== '') {
        opts.password = process.env.REDIS_PASSWORD;
    }
    return opts;
}

/**
 * Cria um client ioredis com timeouts e handlers de erro obrigatórios — evita que uma
 * instabilidade do Redis prenda um `await this.redis.xxx(...)` para sempre (o que travaria
 * a entrega do RabbitMQ até o `consumer_timeout` do broker matar o canal, ver
 * PRECONDITION-FAILED 406 nos logs de produção). `role` é só para identificar o client nos logs.
 */
export function createRedisClient(redisOptions: RedisOptions, role: string): Redis {
    const client = new Redis({
        ...redisOptions,
        // Nenhum comando fica pendurado além de 10s — rejeita e deixa o chamador decidir
        // (nack/retry) em vez de segurar a entrega do RabbitMQ indefinidamente.
        commandTimeout: 10_000,
        maxRetriesPerRequest: 3,
        retryStrategy: (attempt: number) => Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000),
        reconnectOnError: () => true,
    });
    client.on('error', (err) => {
        console.error(workerLogLine(`Redis[${role}] error:`), err?.message ?? err);
    });
    client.on('close', () => {
        console.warn(workerLogLine(`Redis[${role}] connection closed — ioredis irá reconectar automaticamente.`));
    });
    client.on('reconnecting', (delay: number) => {
        console.warn(workerLogLine(`Redis[${role}] reconnecting em ${delay}ms...`));
    });
    return client;
}
