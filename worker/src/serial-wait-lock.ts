import type Redis from 'ioredis';

/**
 * Lock serial (ROTPermiteParalelismo=false) com fila de espera FIFO durável no Redis.
 * Extraído de `rotina-consumer.ts` para ser testável isoladamente (ver
 * `serial-wait-lock.selftest.ts`) sem precisar instanciar RabbitMQ/Prisma/etc.
 *
 * Semáforo por (instituicaoCodigo, rotinaCodigo): ZSET com limite 1 e lease (score =
 * timestamp de expiração — vaga órfã libera sozinha se o worker morrer, renovada via
 * heartbeat enquanto o job roda de verdade, ver `serial-lease-heartbeat.ts`).
 *
 * Fila de espera: Redis List (`wait`) só com `exeId` — o payload completo é reconstruído a
 * partir do `ROTExecucaoLog` (Postgres) na hora de drenar. Um segundo Redis List
 * (`processing`) guarda o item entre o momento em que ele é retirado da `wait` (via `LMOVE`)
 * e o momento em que termina de processar — isso torna o "pop" durável: se o worker morrer
 * nesse intervalo, o item não desaparece, fica em `processing` até ser reclamado de volta
 * para a cabeça da `wait` (ver `reclaimOrphanSerialClaims`).
 */

/**
 * Tenta adquirir o slot serial; se ocupado OU se já há itens na fila de espera, enfileira
 * o exeId (RPUSH) e retorna `false`. A checagem de `LLEN(waitkey) == 0` garante FIFO
 * estrito: uma mensagem nova nunca "pula a fila" de quem já está esperando.
 *
 * Idempotente: se o exeId já é o dono do lock, já está na `wait` ou já está em `processing`,
 * não duplica nada (protege contra redelivery/republicação acidental do mesmo job).
 */
export async function tryAcquireOrEnqueueSerial(
    redis: Redis,
    zkey: string,
    waitkey: string,
    processingkey: string,
    exeId: string,
    leaseMs: number,
): Promise<boolean> {
    const now = Date.now();
    const until = now + leaseMs;
    const result = await redis.eval(
        `local zkey = KEYS[1]
         local waitkey = KEYS[2]
         local processingkey = KEYS[3]
         local now = tonumber(ARGV[1])
         local exe = ARGV[2]
         local untilScore = tonumber(ARGV[3])
         redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)

         if redis.call('ZSCORE', zkey, exe) then
           return 0
         end
         if redis.call('LPOS', waitkey, exe) ~= false then
           return 0
         end
         if redis.call('LPOS', processingkey, exe) ~= false then
           return 0
         end

         local n = redis.call('ZCARD', zkey)
         local waiting = redis.call('LLEN', waitkey)
         if n < 1 and waiting == 0 then
           redis.call('ZADD', zkey, untilScore, exe)
           return 1
         end
         redis.call('RPUSH', waitkey, exe)
         return 0`,
        3,
        zkey,
        waitkey,
        processingkey,
        String(now),
        exeId,
        String(until),
    );
    return Number(result) === 1;
}

/**
 * Libera o slot do exeId informado e, no mesmo passo atômico, promove o próximo item da
 * fila de espera para `processing` (claim durável via `LMOVE`, não mais `LPOP`) e concede o
 * lock a ele. Retorna o exeId promovido (já com o lock concedido e presente em
 * `processingkey`), ou `null` se não havia nada esperando.
 */
export async function releaseSerialSlotAndPopNext(
    redis: Redis,
    zkey: string,
    waitkey: string,
    processingkey: string,
    releasedExeId: string,
    leaseMs: number,
): Promise<string | null> {
    const now = Date.now();
    const until = now + leaseMs;
    const result = await redis.eval(
        `local zkey = KEYS[1]
         local waitkey = KEYS[2]
         local processingkey = KEYS[3]
         local releasedExe = ARGV[1]
         local now = tonumber(ARGV[2])
         local untilScore = tonumber(ARGV[3])
         redis.call('ZREM', zkey, releasedExe)
         redis.call('LREM', processingkey, 0, releasedExe)
         redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
         local n = redis.call('ZCARD', zkey)
         if n < 1 then
           local nextExe = redis.call('LMOVE', waitkey, processingkey, 'LEFT', 'RIGHT')
           if nextExe then
             redis.call('ZADD', zkey, untilScore, nextExe)
             return nextExe
           end
         end
         return false`,
        3,
        zkey,
        waitkey,
        processingkey,
        releasedExeId,
        String(now),
        String(until),
    );
    return typeof result === 'string' ? result : null;
}

/**
 * Devolve o exeId para a **cabeça** da fila de espera sem contar como falha de processamento
 * (usado quando a espera é por capacidade de vaga do tenant, não por erro do job) e, no mesmo
 * passo, tenta promover o item da cabeça (que pode ser o próprio `exeId` recolocado) para
 * `processing`. Preserva ordem FIFO — o item recolocado nunca perde a posição para itens mais
 * novos que estejam entrando na fila nesse meio tempo, pois entra sempre em primeiro lugar.
 */
export async function requeueAtHeadAndClaimNext(
    redis: Redis,
    zkey: string,
    waitkey: string,
    processingkey: string,
    exeId: string,
    leaseMs: number,
): Promise<string | null> {
    const now = Date.now();
    const until = now + leaseMs;
    const result = await redis.eval(
        `local zkey = KEYS[1]
         local waitkey = KEYS[2]
         local processingkey = KEYS[3]
         local exe = ARGV[1]
         local now = tonumber(ARGV[2])
         local untilScore = tonumber(ARGV[3])
         redis.call('ZREM', zkey, exe)
         redis.call('LREM', processingkey, 0, exe)
         if redis.call('LPOS', waitkey, exe) == false then
           redis.call('LPUSH', waitkey, exe)
         end
         redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
         local n = redis.call('ZCARD', zkey)
         if n < 1 then
           local nextExe = redis.call('LMOVE', waitkey, processingkey, 'LEFT', 'RIGHT')
           if nextExe then
             redis.call('ZADD', zkey, untilScore, nextExe)
             return nextExe
           end
         end
         return false`,
        3,
        zkey,
        waitkey,
        processingkey,
        exeId,
        String(now),
        String(until),
    );
    return typeof result === 'string' ? result : null;
}

export interface SerialFailureOutcome {
    /** `true` quando o número de tentativas excedeu o limite — o item foi descartado da fila (não recolocado). */
    exhausted: boolean;
    /** Contagem de tentativas falhas acumuladas para este exeId (após este incremento). */
    attempts: number;
    /** Próximo exeId promovido a `processing` com o lock concedido, se houver. */
    nextExeId: string | null;
}

/**
 * Registra uma falha real de processamento (exceção) do exeId que segurava o lock serial.
 * Incrementa o contador de tentativas (com TTL) e decide atomicamente:
 * - abaixo do limite: recoloca o exeId na **cabeça** da fila de espera (bloqueia os demais
 *   até ele conseguir, ou esgotar as tentativas — decisão de produto: ordem estrita FIFO);
 * - no limite: descarta da fila (quem chamou é responsável por finalizar como ERRO/DLQ).
 * Em ambos os casos, libera o lock e tenta promover o próximo item da cabeça (que pode ser o
 * próprio exeId recolocado) para `processing`.
 */
export async function failSerialAttemptAndClaimNext(
    redis: Redis,
    zkey: string,
    waitkey: string,
    processingkey: string,
    attemptsKey: string,
    exeId: string,
    maxAttempts: number,
    attemptsTtlSec: number,
    leaseMs: number,
): Promise<SerialFailureOutcome> {
    const now = Date.now();
    const until = now + leaseMs;
    const result = await redis.eval(
        `local zkey = KEYS[1]
         local waitkey = KEYS[2]
         local processingkey = KEYS[3]
         local attemptskey = KEYS[4]
         local exe = ARGV[1]
         local maxAttempts = tonumber(ARGV[2])
         local ttlSec = tonumber(ARGV[3])
         local now = tonumber(ARGV[4])
         local untilScore = tonumber(ARGV[5])

         redis.call('ZREM', zkey, exe)
         redis.call('LREM', processingkey, 0, exe)

         local attempts = redis.call('INCR', attemptskey)
         if attempts == 1 then
           redis.call('EXPIRE', attemptskey, ttlSec)
         end

         local exhausted = attempts >= maxAttempts
         if exhausted then
           redis.call('DEL', attemptskey)
         else
           if redis.call('LPOS', waitkey, exe) == false then
             redis.call('LPUSH', waitkey, exe)
           end
         end

         redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
         local n = redis.call('ZCARD', zkey)
         local nextExe = false
         if n < 1 then
           nextExe = redis.call('LMOVE', waitkey, processingkey, 'LEFT', 'RIGHT')
           if nextExe then
             redis.call('ZADD', zkey, untilScore, nextExe)
           end
         end

         return { exhausted and 1 or 0, attempts, nextExe or false }`,
        4,
        zkey,
        waitkey,
        processingkey,
        attemptsKey,
        exeId,
        String(maxAttempts),
        String(attemptsTtlSec),
        String(now),
        String(until),
    ) as [number, number, string | 0];

    const [exhaustedFlag, attempts, nextExeRaw] = result;
    return {
        exhausted: exhaustedFlag === 1,
        attempts,
        nextExeId: typeof nextExeRaw === 'string' ? nextExeRaw : null,
    };
}

export async function getSerialAttempts(redis: Redis, attemptsKey: string): Promise<number> {
    const v = await redis.get(attemptsKey);
    return v ? Number(v) || 0 : 0;
}

export async function clearSerialAttempts(redis: Redis, attemptsKey: string): Promise<void> {
    await redis.del(attemptsKey);
}

/**
 * Hardening contra crash-durante-claim: se o processo morrer entre o `LMOVE` (pop da wait
 * para processing) e o término do processamento, o item fica "preso" em `processing` — nem
 * na fila de espera nem segurando o lock (que expira sozinho via lease). Este helper detecta
 * esse cenário (lock livre/expirado + itens presos em `processing`) e devolve todos para a
 * **cabeça** da fila de espera, preservando a ordem FIFO original entre eles.
 *
 * Retorna a lista de exeIds reclamados (para logging).
 */
export async function reclaimOrphanSerialClaims(
    redis: Redis,
    zkey: string,
    waitkey: string,
    processingkey: string,
): Promise<string[]> {
    const now = Date.now();
    const result = await redis.eval(
        `local zkey = KEYS[1]
         local waitkey = KEYS[2]
         local processingkey = KEYS[3]
         local now = tonumber(ARGV[1])
         redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
         local n = redis.call('ZCARD', zkey)
         local moved = {}
         if n < 1 then
           while true do
             local item = redis.call('RPOP', processingkey)
             if not item then break end
             redis.call('LPUSH', waitkey, item)
             table.insert(moved, item)
           end
         end
         return moved`,
        3,
        zkey,
        waitkey,
        processingkey,
        String(now),
    ) as string[];
    return Array.isArray(result) ? result : [];
}
