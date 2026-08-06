import type Redis from 'ioredis';

/**
 * Lock serial (ROTPermiteParalelismo=false) com fila de espera FIFO no Redis.
 * Extraído de `rotina-consumer.ts` para ser testável isoladamente (ver
 * `serial-wait-lock.selftest.ts`) sem precisar instanciar RabbitMQ/Prisma/etc.
 *
 * Semáforo por (instituicaoCodigo, rotinaCodigo): ZSET com limite 1 e lease (score =
 * timestamp de expiração — vaga órfã libera sozinha se o worker morrer). Lista de espera:
 * Redis List (RPUSH/LPOP) guardando apenas `exeId` — o payload completo é reconstruído a
 * partir do `ROTExecucaoLog` (Postgres) na hora de drenar.
 */

/**
 * Tenta adquirir o slot serial; se ocupado OU se já há itens na fila de espera, enfileira
 * o exeId (RPUSH) e retorna `false`. A checagem de `LLEN(waitkey) == 0` garante FIFO
 * estrito: uma mensagem nova nunca "pula a fila" de quem já está esperando.
 */
export async function tryAcquireOrEnqueueSerial(
    redis: Redis,
    zkey: string,
    waitkey: string,
    exeId: string,
    leaseMs: number,
): Promise<boolean> {
    const now = Date.now();
    const until = now + leaseMs;
    const result = await redis.eval(
        `local zkey = KEYS[1]
         local waitkey = KEYS[2]
         local now = tonumber(ARGV[1])
         local exe = ARGV[2]
         local untilScore = tonumber(ARGV[3])
         redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
         local n = redis.call('ZCARD', zkey)
         local waiting = redis.call('LLEN', waitkey)
         if n < 1 and waiting == 0 then
           redis.call('ZADD', zkey, untilScore, exe)
           return 1
         end
         redis.call('RPUSH', waitkey, exe)
         return 0`,
        2,
        zkey,
        waitkey,
        String(now),
        exeId,
        String(until),
    );
    return Number(result) === 1;
}

/**
 * Libera o slot do exeId informado e, no mesmo passo atômico, promove o próximo item da
 * fila de espera (se houver e o slot ficar livre). Retorna o exeId promovido (já com o
 * lock concedido), ou `null` se não havia nada esperando.
 */
export async function releaseSerialSlotAndPopNext(
    redis: Redis,
    zkey: string,
    waitkey: string,
    releasedExeId: string,
    leaseMs: number,
): Promise<string | null> {
    const now = Date.now();
    const until = now + leaseMs;
    const result = await redis.eval(
        `local zkey = KEYS[1]
         local waitkey = KEYS[2]
         local releasedExe = ARGV[1]
         local now = tonumber(ARGV[2])
         local untilScore = tonumber(ARGV[3])
         redis.call('ZREM', zkey, releasedExe)
         redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
         local n = redis.call('ZCARD', zkey)
         if n < 1 then
           local nextExe = redis.call('LPOP', waitkey)
           if nextExe then
             redis.call('ZADD', zkey, untilScore, nextExe)
             return nextExe
           end
         end
         return false`,
        2,
        zkey,
        waitkey,
        releasedExeId,
        String(now),
        String(until),
    );
    return typeof result === 'string' ? result : null;
}
