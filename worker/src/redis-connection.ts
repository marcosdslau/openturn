import type { RedisOptions } from 'ioredis';

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
