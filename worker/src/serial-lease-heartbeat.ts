import type Redis from 'ioredis';

/**
 * Renova periodicamente o score (deadline) de um membro num ZSET de lease, desde que ele
 * ainda seja o dono do slot — protege contra o lease expirar (e outro worker/instância
 * assumir o slot) enquanto um job potencialmente longo ainda está rodando de verdade.
 *
 * O guard condicional (`ZSCORE` antes do `ZADD`) evita que um heartbeat atrasado reative
 * um lease que já expirou e foi tomado por outro dono — sem isso, dois workers poderiam
 * achar que seguram o mesmo slot simultaneamente.
 *
 * Existe para permitir `ROTINA_INFLIGHT_LEASE_SEC` baixo (ex.: 120s): sem renovação, um job
 * de 10 minutos perderia o slot no meio da execução e outra instância assumiria o mesmo lock,
 * quebrando a garantia de "um por vez" das rotinas serial e o limite de paralelismo do tenant.
 */
export class LeaseHeartbeat {
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private readonly redis: Redis,
        private readonly zkey: string,
        private readonly member: string,
        private readonly leaseMs: number,
    ) {}

    start(): void {
        const intervalMs = Math.max(1000, Math.floor(this.leaseMs / 3));
        this.timer = setInterval(() => {
            this.renew().catch(() => {
                // Erro de renovação (Redis instável) não deve derrubar o job em andamento —
                // na pior hipótese o lease expira naturalmente e o item é reclamado depois
                // pelo tick de reconciliação (`reclaimOrphanSerialClaims`).
            });
        }, intervalMs);
        this.timer.unref?.();
    }

    private async renew(): Promise<void> {
        const now = Date.now();
        await this.redis.eval(
            `local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
             if score then
               redis.call('ZADD', KEYS[1], tonumber(ARGV[2]), ARGV[1])
               return 1
             end
             return 0`,
            1,
            this.zkey,
            this.member,
            String(now + this.leaseMs),
        );
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
