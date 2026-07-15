/**
 * Converte valores não serializáveis em IPC (ex.: BigInt do Prisma) para tipos JSON-safe.
 */
export function sanitizeForIpc<T>(value: T): T {
    if (typeof value === 'bigint') {
        return (value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()) as T;
    }

    if (value instanceof Date) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForIpc(item)) as T;
    }

    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            out[key] = sanitizeForIpc(entry);
        }
        return out as T;
    }

    return value;
}
