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

/**
 * Mesmas variáveis que o worker. Preferir REDIS_HOST/PORT + USER/PASS.
 * Se existir REDIS_URL e não REDIS_HOST, usa a URL (user/password com encoding %XX se necessário).
 */
export function getRedisConnectionOptions(): RedisOptions {
    if (process.env.REDIS_URL?.trim() && !process.env.REDIS_HOST?.trim()) {
        return optionsFromUrl(process.env.REDIS_URL.trim());
    }
    const host = process.env.REDIS_HOST?.trim() || 'localhost';
    const port = parseInt(process.env.REDIS_PORT?.trim() || '6379', 10);
    const opts: RedisOptions = { host, port };
    const username = process.env.REDIS_USERNAME?.trim();
    if (username) {
        opts.username = username;
    }
    const password = process.env.REDIS_PASSWORD?.trim();
    if (password !== undefined && password !== '') {
        opts.password = password;
    }
    return opts;
}
