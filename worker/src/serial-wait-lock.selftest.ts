import Redis from 'ioredis';
import { tryAcquireOrEnqueueSerial, releaseSerialSlotAndPopNext } from './serial-wait-lock';

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(`serial-wait-lock selftest: ${msg}`);
}

async function main() {
    const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
    });

    const runId = `selftest:${Date.now()}`;
    const zkey = `${runId}:z`;
    const waitkey = `${runId}:wait`;
    const leaseMs = 60_000;

    try {
        // 1. Primeira aquisição livre é concedida direto (sem fila de espera).
        const first = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, 'exe-1', leaseMs);
        assert(first === true, 'primeira aquisição deveria ser concedida');
        assert((await redis.llen(waitkey)) === 0, 'fila de espera deveria estar vazia após aquisição direta');

        // 2. Com o lock ocupado, a segunda e terceira mensagens são enfileiradas em ordem (FIFO).
        const second = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, 'exe-2', leaseMs);
        assert(second === false, 'segunda aquisição deveria ser enfileirada (lock ocupado)');
        const third = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, 'exe-3', leaseMs);
        assert(third === false, 'terceira aquisição deveria ser enfileirada (lock ocupado)');
        assert((await redis.llen(waitkey)) === 2, 'fila de espera deveria ter 2 itens');
        assert((await redis.lrange(waitkey, 0, -1)).join(',') === 'exe-2,exe-3', 'ordem FIFO deveria ser exe-2, exe-3');

        // 3. Mesmo com o lock livre momentaneamente, uma "mensagem nova" não pode furar a fila
        //    enquanto houver itens esperando — precisa entrar no fim da lista também.
        // (Sem liberar o lock ainda: exe-1 continua ocupando.)
        const fourthStillOccupied = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, 'exe-4', leaseMs);
        assert(fourthStillOccupied === false, 'quarta aquisição deveria ser enfileirada');
        assert((await redis.llen(waitkey)) === 3, 'fila de espera deveria ter 3 itens após exe-4');

        // 4. Libera exe-1: deve promover exe-2 (cabeça da fila) atomicamente.
        const promoted1 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, 'exe-1', leaseMs);
        assert(promoted1 === 'exe-2', `esperava promover exe-2, obteve ${promoted1}`);
        assert((await redis.zcard(zkey)) === 1, 'lock deveria estar ocupado por exe-2 após promoção');
        assert((await redis.llen(waitkey)) === 2, 'fila de espera deveria ter 2 itens restantes (exe-3, exe-4)');

        // 5. Enquanto exe-2 está no lock (fila não vazia), uma aquisição "nova" ainda enfileira.
        const fifthStillOccupied = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, 'exe-5', leaseMs);
        assert(fifthStillOccupied === false, 'quinta aquisição deveria ser enfileirada mesmo com fila parcialmente drenada');

        // 6. Drena o restante em ordem: exe-2 -> exe-3 -> exe-4 -> exe-5 -> vazio.
        const promoted2 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, 'exe-2', leaseMs);
        assert(promoted2 === 'exe-3', `esperava promover exe-3, obteve ${promoted2}`);
        const promoted3 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, 'exe-3', leaseMs);
        assert(promoted3 === 'exe-4', `esperava promover exe-4, obteve ${promoted3}`);
        const promoted4 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, 'exe-4', leaseMs);
        assert(promoted4 === 'exe-5', `esperava promover exe-5, obteve ${promoted4}`);
        const promoted5 = await releaseSerialSlotAndPopNext(redis, zkey, waitkey, 'exe-5', leaseMs);
        assert(promoted5 === null, 'fila deveria estar vazia — não há mais nada para promover');
        assert((await redis.zcard(zkey)) === 0, 'lock deveria estar livre após drenar tudo');

        // 7. Lock livre e fila vazia: aquisição direta funciona de novo.
        const sixth = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, 'exe-6', leaseMs);
        assert(sixth === true, 'aquisição deveria ser concedida direto com lock e fila vazios');

        // 8. Lease expirado: um lock "órfão" (score no passado) libera sozinho na próxima tentativa.
        await redis.zadd(zkey, 1, 'exe-6'); // score = timestamp 1 (bem no passado) simula expiração
        const seventh = await tryAcquireOrEnqueueSerial(redis, zkey, waitkey, 'exe-7', 60_000);
        assert(seventh === true, 'lock expirado deveria ser limpo e a nova aquisição concedida');

        console.log('serial-wait-lock selftest OK');
    } finally {
        await redis.del(zkey, waitkey);
        await redis.quit();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
