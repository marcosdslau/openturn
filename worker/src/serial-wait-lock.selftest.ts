import 'dotenv/config';
import Redis from 'ioredis';
import {
    tryAcquireOrEnqueueSerial,
    releaseSerialSlotAndPopNext,
    requeueAtHeadAndClaimNext,
    failSerialAttemptAndClaimNext,
    getSerialAttempts,
    clearSerialAttempts,
    reclaimOrphanSerialClaims,
} from './serial-wait-lock';
import { LeaseHeartbeat } from './serial-lease-heartbeat';
import { getRedisConnectionOptions } from './redis-connection';

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(`serial-wait-lock selftest: ${msg}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const redis = new Redis(getRedisConnectionOptions());

    const runId = `selftest:${Date.now()}`;
    const zkey = `${runId}:z`;
    const waitkey = `${runId}:wait`;
    const processingkey = `${runId}:processing`;
    const leaseMs = 60_000;

    try {
        // 1. Primeira aquisição livre é concedida direto (sem fila de espera, sem tocar em `processing`).
        const first = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-1', leaseMs);
        assert(first === true, 'primeira aquisição deveria ser concedida');
        assert((await redis.llen(waitkey)) === 0, 'fila de espera deveria estar vazia após aquisição direta');
        assert((await redis.llen(processingkey)) === 0, 'processing deveria estar vazio após aquisição direta');

        // 2. Com o lock ocupado, a segunda e terceira mensagens são enfileiradas em ordem (FIFO).
        const second = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-2', leaseMs);
        assert(second === false, 'segunda aquisição deveria ser enfileirada (lock ocupado)');
        const third = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-3', leaseMs);
        assert(third === false, 'terceira aquisição deveria ser enfileirada (lock ocupado)');
        assert((await redis.llen(waitkey)) === 2, 'fila de espera deveria ter 2 itens');
        assert((await redis.lrange(waitkey, 0, -1)).join(',') === 'exe-2,exe-3', 'ordem FIFO deveria ser exe-2, exe-3');

        // 2b. Dedup: reenviar exe-2 (já na wait list) não deve duplicar a entrada.
        const dupWhileWaiting = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-2', leaseMs);
        assert(dupWhileWaiting === false, 'reenvio de exe-2 (já esperando) não deveria ser tratado como aquisição');
        assert((await redis.llen(waitkey)) === 2, 'dedup: fila de espera não deveria crescer com exeId repetido');

        // 2c. Dedup: reenviar exe-1 (dono atual do lock) também não deve duplicar/alterar nada.
        const dupHolder = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-1', leaseMs);
        assert(dupHolder === false, 'reenvio de exe-1 (já dono do lock) não deveria readquirir/duplicar');
        assert((await redis.zcard(zkey)) === 1, 'dedup: lock não deveria ganhar um segundo membro');

        // 3. Mesmo com o lock livre momentaneamente, uma "mensagem nova" não pode furar a fila
        //    enquanto houver itens esperando — precisa entrar no fim da lista também.
        // (Sem liberar o lock ainda: exe-1 continua ocupando.)
        const fourthStillOccupied = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-4', leaseMs);
        assert(fourthStillOccupied === false, 'quarta aquisição deveria ser enfileirada');
        assert((await redis.llen(waitkey)) === 3, 'fila de espera deveria ter 3 itens após exe-4');

        // 4. Libera exe-1: deve promover exe-2 (cabeça da fila) atomicamente via LMOVE (claim
        //    durável — exe-2 deve aparecer em `processing`, não simplesmente desaparecer da wait).
        const promoted1 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, processingkey, 'exe-1', leaseMs);
        assert(promoted1 === 'exe-2', `esperava promover exe-2, obteve ${promoted1}`);
        assert((await redis.zcard(zkey)) === 1, 'lock deveria estar ocupado por exe-2 após promoção');
        assert((await redis.llen(waitkey)) === 2, 'fila de espera deveria ter 2 itens restantes (exe-3, exe-4)');
        assert((await redis.lrange(processingkey, 0, -1)).join(',') === 'exe-2', 'exe-2 deveria estar em processing (claim durável)');

        // 5. Enquanto exe-2 está no lock (fila não vazia), uma aquisição "nova" ainda enfileira.
        const fifthStillOccupied = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-5', leaseMs);
        assert(fifthStillOccupied === false, 'quinta aquisição deveria ser enfileirada mesmo com fila parcialmente drenada');

        // 6. Drena o restante em ordem: exe-2 -> exe-3 -> exe-4 -> exe-5 -> vazio. A cada
        //    release, o exeId liberado sai de `processing` (LREM) e o próximo entra.
        const promoted2 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, processingkey, 'exe-2', leaseMs);
        assert(promoted2 === 'exe-3', `esperava promover exe-3, obteve ${promoted2}`);
        assert((await redis.lrange(processingkey, 0, -1)).join(',') === 'exe-3', 'processing deveria conter só exe-3 após release de exe-2');
        const promoted3 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, processingkey, 'exe-3', leaseMs);
        assert(promoted3 === 'exe-4', `esperava promover exe-4, obteve ${promoted3}`);
        const promoted4 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, processingkey, 'exe-4', leaseMs);
        assert(promoted4 === 'exe-5', `esperava promover exe-5, obteve ${promoted4}`);
        const promoted5 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, processingkey, 'exe-5', leaseMs);
        assert(promoted5 === null, 'fila deveria estar vazia — não há mais nada para promover');
        assert((await redis.zcard(zkey)) === 0, 'lock deveria estar livre após drenar tudo');
        assert((await redis.llen(processingkey)) === 0, 'processing deveria estar vazio após drenar tudo');

        // 7. Lock livre e fila vazia: aquisição direta funciona de novo.
        const sixth = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-6', leaseMs);
        assert(sixth === true, 'aquisição deveria ser concedida direto com lock e fila vazios');

        // 8. Lease expirado: um lock "órfão" (score no passado) libera sozinho na próxima tentativa.
        await redis.zadd(zkey, 1, 'exe-6'); // score = timestamp 1 (bem no passado) simula expiração
        const seventh = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-7', 60_000);
        assert(seventh === true, 'lock expirado deveria ser limpo e a nova aquisição concedida');

        // 9. reclaimOrphanSerialClaims: simula um crash entre o LMOVE (claim) e o término do
        //    processamento — o item fica preso em `processing` com o lock expirado. Deve
        //    voltar para a cabeça da wait list.
        await redis.del(zkey, waitkey, processingkey);
        await redis.rpush(waitkey, 'orphan-1', 'orphan-2', 'orphan-3');
        const claimed = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, processingkey, '__noop__', leaseMs);
        assert(claimed === 'orphan-1', 'deveria promover orphan-1 para processing');
        // Simula o worker morrendo: expira o lock manualmente sem passar por release normal.
        await redis.zadd(zkey, 1, 'orphan-1');
        const reclaimed = await reclaimOrphanSerialClaims(redis, zkey, waitkey, processingkey);
        assert(reclaimed.length === 1 && reclaimed[0] === 'orphan-1', `esperava reclamar [orphan-1], obteve ${JSON.stringify(reclaimed)}`);
        assert((await redis.llen(processingkey)) === 0, 'processing deveria estar vazio após reclaim');
        assert(
            (await redis.lrange(waitkey, 0, -1)).join(',') === 'orphan-1,orphan-2,orphan-3',
            'orphan-1 reclamado deveria voltar para a CABEÇA da wait list, preservando ordem',
        );

        // 10. Múltiplos itens presos em `processing` (edge case) devem ser devolvidos à wait
        //     list preservando a ordem relativa entre eles (mais antigo primeiro).
        await redis.del(zkey, waitkey, processingkey);
        await redis.rpush(processingkey, 'stuck-old', 'stuck-new');
        const reclaimedMulti = await reclaimOrphanSerialClaims(redis, zkey, waitkey, processingkey);
        assert(reclaimedMulti.length === 2, `esperava reclamar 2 itens, obteve ${JSON.stringify(reclaimedMulti)}`);
        assert(
            (await redis.lrange(waitkey, 0, -1)).join(',') === 'stuck-old,stuck-new',
            `ordem relativa deveria ser preservada (stuck-old antes de stuck-new), obteve ${(await redis.lrange(waitkey, 0, -1)).join(',')}`,
        );

        // 11. failSerialAttemptAndClaimNext: abaixo do limite, recoloca na CABEÇA da fila (à
        //     frente de quem já esperava) e re-promove — mesmo exeId volta para `processing`.
        await redis.del(zkey, waitkey, processingkey);
        const attemptsKey = `${runId}:attempts:exe-f1`;
        await redis.del(attemptsKey);
        await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-f1', leaseMs); // acquired direto
        await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-other', leaseMs); // enfileira atrás
        assert((await redis.lrange(waitkey, 0, -1)).join(',') === 'exe-other', 'exe-other deveria estar esperando atrás de exe-f1');

        const fail1 = await failSerialAttemptAndClaimNext(
            redis, zkey, waitkey, processingkey, attemptsKey, 'exe-f1', 3, 3600, leaseMs,
        );
        assert(fail1.exhausted === false, 'primeira falha não deveria esgotar tentativas (limite=3)');
        assert(fail1.attempts === 1, `esperava attempts=1, obteve ${fail1.attempts}`);
        assert(fail1.nextExeId === 'exe-f1', `esperava reclamar o próprio exe-f1 de volta (cabeça da fila), obteve ${fail1.nextExeId}`);
        assert(
            (await redis.lrange(waitkey, 0, -1)).join(',') === 'exe-other',
            'exe-other deveria permanecer esperando atrás do exe-f1 recolocado (FIFO preservado)',
        );
        assert((await getSerialAttempts(redis, attemptsKey)) === 1, 'contador de tentativas deveria refletir 1 falha');

        // 12. Repetir falhas até esgotar o limite: no limite, o item é descartado da fila (não
        //     recolocado) e o contador é zerado; o próximo item real da fila é promovido.
        const fail2 = await failSerialAttemptAndClaimNext(
            redis, zkey, waitkey, processingkey, attemptsKey, 'exe-f1', 3, 3600, leaseMs,
        );
        assert(fail2.exhausted === false && fail2.attempts === 2, 'segunda falha ainda dentro do limite');
        const fail3 = await failSerialAttemptAndClaimNext(
            redis, zkey, waitkey, processingkey, attemptsKey, 'exe-f1', 3, 3600, leaseMs,
        );
        assert(fail3.exhausted === true, `terceira falha deveria esgotar o limite (maxAttempts=3), obteve exhausted=${fail3.exhausted}`);
        assert(fail3.attempts === 3, `esperava attempts=3, obteve ${fail3.attempts}`);
        assert(fail3.nextExeId === 'exe-other', `esperava promover exe-other (exe-f1 descartado), obteve ${fail3.nextExeId}`);
        assert((await redis.lpos(waitkey, 'exe-f1')) === null, 'exe-f1 esgotado não deveria mais estar na wait list');
        assert((await getSerialAttempts(redis, attemptsKey)) === 0, 'contador de tentativas deveria ser zerado após esgotar');

        await clearSerialAttempts(redis, attemptsKey);

        // 13. requeueAtHeadAndClaimNext: usado para contenção de capacidade (não conta como
        //     falha) — recoloca na cabeça sem tocar em nenhum contador de tentativas.
        await redis.del(zkey, waitkey, processingkey);
        const capKey = `${runId}:attempts:exe-cap`;
        await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, processingkey, 'exe-cap', leaseMs);
        const requeued = await requeueAtHeadAndClaimNext(redis, zkey, waitkey, processingkey, 'exe-cap', leaseMs);
        assert(requeued === 'exe-cap', `esperava reclamar o próprio exe-cap, obteve ${requeued}`);
        assert((await getSerialAttempts(redis, capKey)) === 0, 'requeue por capacidade não deveria incrementar tentativas');

        // 14. LeaseHeartbeat: renova o score do ZSET periodicamente enquanto o membro existir;
        //     não faz nada (sem erro) se o membro já não for mais o dono do lock.
        await redis.del(zkey, waitkey, processingkey);
        const now = Date.now();
        await redis.zadd(zkey, now + 300, 'hb-owner');
        // leaseMs baixo só para o teste rodar rápido; LeaseHeartbeat usa intervalo mínimo de
        // 1s (Math.max(1000, leaseMs/3)), então esperamos passar de um tick real.
        const heartbeat = new LeaseHeartbeat(redis, zkey, 'hb-owner', 300);
        heartbeat.start();
        await sleep(1500);
        heartbeat.stop();
        const scoreAfter = await redis.zscore(zkey, 'hb-owner');
        assert(scoreAfter !== null && Number(scoreAfter) > now + 300, 'heartbeat deveria ter renovado o score para além do valor original');

        await redis.del(zkey);
        const heartbeatNoOwner = new LeaseHeartbeat(redis, zkey, 'ghost', 300);
        heartbeatNoOwner.start();
        await sleep(1200);
        heartbeatNoOwner.stop();
        assert((await redis.zscore(zkey, 'ghost')) === null, 'heartbeat não deveria recriar um membro que não é mais dono do lock');

        console.log('serial-wait-lock selftest OK');
    } finally {
        await redis.del(
            zkey, waitkey, processingkey,
            `${runId}:attempts:exe-f1`,
            `${runId}:attempts:exe-cap`,
        );
        await redis.quit();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
