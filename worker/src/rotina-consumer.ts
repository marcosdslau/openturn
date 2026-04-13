import * as amqp from 'amqplib';
import type { ConsumeMessage, Options } from 'amqplib';
import { PrismaClient, StatusExecucao } from '@prisma/client';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { join } from 'path';
import { DbTenantProxy } from './engine/db-tenant-proxy';
import { WorkerProcessManager } from './engine/process-manager';
import {
    getRabbitUrl,
    getMainQueueName,
    getGlobalRetryQueue,
    getJobsDlxExchange,
    getJobsDlxQueue,
    getJobsExchange,
    getJobsRetryExchange,
    RETRY_DLX_ROUTING_KEY,
} from './rabbit-connection';
import { workerLogLine } from './worker-log';
import {
    channelCancel,
    channelFinished,
    channelInstituicaoRefresh,
    redisPendingKey,
    redisInflightZkey,
    redisSerialInflightZkey,
} from './redis-keys';

export interface RotinaJobData {
    exeId: string;
    rotinaCodigo: number;
    instituicaoCodigo: number;
    trigger: 'SCHEDULE' | 'WEBHOOK';
    requestEnvelope?: any;
    enqueuedAt: string;
}

interface InstituicaoAtiva {
    INSCodigo: number;
    INSMaxExecucoesSimultaneas: number;
    INSAtivo: boolean;
    INSWorkerAtivo: boolean;
}

interface ReconcileAllMessage {
    reconcileAll: true;
}

const MIN_PREFETCH = 10;
const RETRY_TTL_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_HEADER = 'x-rotina-retry-count';
const POLL_INTERVAL_MS = 120000;
/** Vaga no semáforo por instituição expira sozinha se o worker morrer após ZADD (ZSET score = deadline). */
const INFLIGHT_LEASE_MS = Math.max(
    60_000,
    parseInt(process.env.ROTINA_INFLIGHT_LEASE_SEC || String(3600), 10) * 1000,
);

const ALLOWED_MODELS = [
    'pESPessoa', 'mATMatricula', 'rEGRegistroPassagem',
    'eQPEquipamento', 'pESEquipamentoMapeamento', 'eRPConfiguracao', 'iNSInstituicao',
];

const SCHEMA_DEFINITION = {
    PESPessoa: {
        alias: 'Pessoa',
        fields: [
            { name: 'PESCodigo', type: 'Int', pk: true },
            { name: 'PESIdExterno', type: 'String' },
            { name: 'PESNome', type: 'String' },
            { name: 'PESNomeSocial', type: 'String' },
            { name: 'PESDocumento', type: 'String' },
            { name: 'PESEmail', type: 'String' },
            { name: 'PESTelefone', type: 'String' },
            { name: 'PESCelular', type: 'String' },
            { name: 'PESFotoBase64', type: 'String' },
            { name: 'PESFotoExtensao', type: 'String' },
            { name: 'PESGrupo', type: 'String' },
            { name: 'PESCartaoTag', type: 'String' },
            { name: 'PESAtivo', type: 'Boolean' },
            { name: 'createdAt', type: 'DateTime' },
            { name: 'updatedAt', type: 'DateTime' },
            { name: 'deletedAt', type: 'DateTime' },
        ],
    },
    MATMatricula: {
        alias: 'Matricula',
        fields: [
            { name: 'MATCodigo', type: 'Int', pk: true },
            { name: 'PESCodigo', type: 'Int', fk: 'PESPessoa' },
            { name: 'MATNumero', type: 'String' },
            { name: 'MATCurso', type: 'String' },
            { name: 'MATSerie', type: 'String' },
            { name: 'MATTurma', type: 'String' },
            { name: 'MATAtivo', type: 'Boolean' },
            { name: 'createdAt', type: 'DateTime' },
        ],
    },
    REGRegistroPassagem: {
        alias: 'RegistroPassagem',
        fields: [
            { name: 'REGCodigo', type: 'Int', pk: true },
            { name: 'PESCodigo', type: 'Int', fk: 'PESPessoa' },
            { name: 'EQPCodigo', type: 'Int', fk: 'EQPEquipamento' },
            { name: 'REGAcao', type: 'Enum' },
            { name: 'REGTimestamp', type: 'BigInt' },
            { name: 'REGDataHora', type: 'DateTime' },
            { name: 'createdAt', type: 'DateTime' },
        ],
    },
    EQPEquipamento: {
        alias: 'Equipamento',
        fields: [
            { name: 'EQPCodigo', type: 'Int', pk: true },
            { name: 'EQPDescricao', type: 'String' },
            { name: 'EQPMarca', type: 'String' },
            { name: 'EQPModelo', type: 'String' },
            { name: 'EQPEnderecoIp', type: 'String' },
            { name: 'EQPAtivo', type: 'Boolean' },
            { name: 'createdAt', type: 'DateTime' },
        ],
    },
    ERPConfiguracao: {
        alias: 'ConfigERP',
        fields: [
            { name: 'ERPCodigo', type: 'Int', pk: true },
            { name: 'ERPSistema', type: 'String' },
            { name: 'ERPUrlBase', type: 'String' },
            { name: 'ERPToken', type: 'String' },
            { name: 'ERPConfigJson', type: 'Json' },
        ],
    },
    INSInstituicao: {
        alias: 'Instituicao',
        fields: [
            { name: 'INSCodigo', type: 'Int', pk: true },
            { name: 'INSNome', type: 'String' },
            { name: 'INSAtivo', type: 'Boolean' },
            { name: 'INSConfigHardware', type: 'Json' },
        ],
    },
    PESEquipamentoMapeamento: {
        alias: 'MapeamentoControle',
        fields: [
            { name: 'PESCodigo', type: 'Int', pk: true, fk: 'PESPessoa' },
            { name: 'EQPCodigo', type: 'Int', pk: true, fk: 'EQPEquipamento' },
            { name: 'PEQIdNoEquipamento', type: 'String' },
        ],
    },
};

export async function startConsumer(prisma: PrismaClient, processManager: WorkerProcessManager, redisOptions: RedisOptions) {
    const consumer = new RabbitRotinaConsumer(prisma, processManager, redisOptions);
    await consumer.start();
    return consumer;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class RabbitRotinaConsumer {
    private connection: amqp.ChannelModel | null = null;
    private channel: amqp.Channel | null = null;
    /** Canal só para a fila global de retry (evita prefetch global bloquear republish). */
    private retryChannel: amqp.Channel | null = null;
    private readonly redis = new Redis(this.redisOptions);
    private readonly redisSub = new Redis(this.redisOptions);
    private readonly tenantLimits = new Map<number, number>();
    private readonly consumerTags = new Map<number, string>();
    private pollTimer: NodeJS.Timeout | null = null;

    constructor(
        private readonly prisma: PrismaClient,
        private readonly processManager: WorkerProcessManager,
        private readonly redisOptions: RedisOptions,
    ) { }

    async start() {
        this.connection = await amqp.connect(getRabbitUrl());
        this.channel = await this.connection.createChannel();
        await this.channel.prefetch(MIN_PREFETCH, true);

        this.retryChannel = await this.connection.createChannel();
        await this.retryChannel.prefetch(50, false);

        await this.setupGlobalTopology();
        await this.startGlobalRetryConsumer();
        await this.startCancelListener();
        await this.startRefreshListener();
        await this.reconcileInstitutions();
        this.pollTimer = setInterval(() => {
            this.reconcileInstitutions().catch((err) => {
                console.error(workerLogLine('reconcile error:'), err);
            });
        }, POLL_INTERVAL_MS);
        console.log(workerLogLine(`Rabbit consumer started (initial prefetch=${MIN_PREFETCH})`));
    }

    async close() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        for (const [inst, tag] of this.consumerTags.entries()) {
            if (this.channel) await this.channel.cancel(tag);
            this.consumerTags.delete(inst);
        }
        await this.redisSub.unsubscribe(channelInstituicaoRefresh(), channelCancel());
        await this.redisSub.quit();
        await this.redis.quit();
        if (this.retryChannel) await this.retryChannel.close();
        if (this.channel) await this.channel.close();
        if (this.connection) await this.connection.close();
    }

    private async setupGlobalTopology() {
        if (!this.channel || !this.retryChannel) return;
        await this.channel.assertExchange(getJobsExchange(), 'direct', { durable: true });
        await this.channel.assertExchange(getJobsRetryExchange(), 'direct', { durable: true });
        await this.channel.assertExchange(getJobsDlxExchange(), 'direct', { durable: true });
        await this.channel.assertQueue(getJobsDlxQueue(), { durable: true });
        await this.channel.bindQueue(getJobsDlxQueue(), getJobsDlxExchange(), 'final');

        await this.retryChannel.assertQueue(getGlobalRetryQueue(), { durable: true });
        await this.retryChannel.bindQueue(getGlobalRetryQueue(), getJobsRetryExchange(), RETRY_DLX_ROUTING_KEY);
    }

    private async startGlobalRetryConsumer() {
        if (!this.retryChannel) return;
        await this.retryChannel.consume(getGlobalRetryQueue(), (msg) => {
            this.onRetryQueueMessage(msg).catch((err) => {
                console.error(workerLogLine('retry consumer error:'), err);
            });
        }, { noAck: false });
    }

    private async onRetryQueueMessage(msg: ConsumeMessage | null) {
        if (!msg || !this.retryChannel) return;
        const ch = this.retryChannel;

        let data: RotinaJobData;
        try {
            data = JSON.parse(msg.content.toString()) as RotinaJobData;
        } catch {
            ch.ack(msg);
            return;
        }

        const prev = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0);
        const nextRetry = prev + 1;
        if (nextRetry > MAX_RETRIES) {
            await this.sendToFinalDlq(msg, data, 'Máximo de tentativas atingido (retry global)');
            ch.ack(msg);
            await updateExecLog(this.prisma, data.exeId, StatusExecucao.ERRO, 'Máximo de tentativas atingido');
            return;
        }

        await sleep(RETRY_TTL_MS);

        const headers = {
            ...(msg.properties.headers || {}),
            [RETRY_HEADER]: nextRetry,
        };
        const properties: Options.Publish = {
            persistent: true,
            headers,
            messageId: msg.properties.messageId || data.exeId,
            correlationId: msg.properties.correlationId || data.exeId,
            contentType: msg.properties.contentType || 'application/json',
            timestamp: Date.now(),
        };

        ch.publish(getJobsExchange(), String(data.instituicaoCodigo), msg.content, properties);
        ch.ack(msg);
    }

    private async startCancelListener() {
        await this.redisSub.subscribe(channelCancel());
        this.redisSub.on('message', (_channel: string, message: string) => {
            try {
                const { exeId } = JSON.parse(message);
                if (exeId) this.processManager.killProcess(exeId);
            } catch {
                // ignore invalid payload
            }
        });
    }

    private async startRefreshListener() {
        await this.redisSub.subscribe(channelInstituicaoRefresh());
        this.redisSub.on('message', (channel, message) => {
            if (channel !== channelInstituicaoRefresh()) return;
            this.handleRefreshMessage(message).catch((err) => {
                console.error(workerLogLine('refresh handler error:'), err);
            });
        });
    }

    private async handleRefreshMessage(message: string) {
        let parsed: InstituicaoAtiva | ReconcileAllMessage;
        try {
            parsed = JSON.parse(message) as InstituicaoAtiva | ReconcileAllMessage;
        } catch {
            return;
        }
        if ((parsed as ReconcileAllMessage).reconcileAll === true) {
            await this.reconcileInstitutions();
            return;
        }
        const payload = parsed as InstituicaoAtiva;
        if (!payload?.INSCodigo) return;
        this.tenantLimits.set(payload.INSCodigo, payload.INSMaxExecucoesSimultaneas || 8);
        const workerAtivo = payload.INSWorkerAtivo !== false;
        if (!payload.INSAtivo || !workerAtivo) {
            await this.stopConsumer(payload.INSCodigo);
            await this.updateChannelPrefetch();
            return;
        }
        await this.ensureTenantTopology(payload);
        await this.ensureTenantConsumer(payload);
        await this.updateChannelPrefetch();
    }

    private async reconcileInstitutions() {
        const instituicoes = await this.prisma.iNSInstituicao.findMany({
            where: { INSAtivo: true, INSWorkerAtivo: true },
            select: {
                INSCodigo: true,
                INSAtivo: true,
                INSMaxExecucoesSimultaneas: true,
                INSWorkerAtivo: true,
            },
        });

        const activeSet = new Set<number>();
        for (const instituicao of instituicoes) {
            activeSet.add(instituicao.INSCodigo);
            this.tenantLimits.set(instituicao.INSCodigo, instituicao.INSMaxExecucoesSimultaneas || 8);
            await this.ensureTenantTopology(instituicao);
            await this.ensureTenantConsumer(instituicao);
        }

        for (const codigo of this.consumerTags.keys()) {
            if (!activeSet.has(codigo)) {
                await this.stopConsumer(codigo);
            }
        }

        await this.updateChannelPrefetch();
    }

    private async ensureTenantTopology(instituicao: InstituicaoAtiva) {
        if (!this.channel) return;
        const routingKey = String(instituicao.INSCodigo);
        const mainQueue = getMainQueueName(instituicao.INSCodigo);

        await this.channel.assertQueue(mainQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': getJobsRetryExchange(),
                'x-dead-letter-routing-key': RETRY_DLX_ROUTING_KEY,
            },
        });
        await this.channel.bindQueue(mainQueue, getJobsExchange(), routingKey);
    }

    private async ensureTenantConsumer(instituicao: InstituicaoAtiva) {
        if (!this.channel || this.consumerTags.has(instituicao.INSCodigo)) return;
        const queue = getMainQueueName(instituicao.INSCodigo);
        const result = await this.channel.consume(
            queue,
            (msg) => this.onMessage(msg),
            { noAck: false },
        );
        this.consumerTags.set(instituicao.INSCodigo, result.consumerTag);
    }

    private async stopConsumer(instituicaoCodigo: number) {
        if (!this.channel) return;
        const tag = this.consumerTags.get(instituicaoCodigo);
        if (tag) {
            await this.channel.cancel(tag);
            this.consumerTags.delete(instituicaoCodigo);
        }
    }

    /** Ajusta prefetch global do canal para acomodar a soma de todas as vagas de instituições ativas. */
    private async updateChannelPrefetch() {
        if (!this.channel) return;
        const totalSlots = Array.from(this.tenantLimits.values()).reduce((sum, v) => sum + v, 0);
        const prefetch = Math.max(totalSlots + 3, MIN_PREFETCH);
        await this.channel.prefetch(prefetch, true);
        console.log(workerLogLine(`Prefetch adjusted to ${prefetch} (total institution slots: ${totalSlots})`));
    }

    private async onMessage(msg: ConsumeMessage | null) {
        if (!msg || !this.channel) return;
        const channel = this.channel;

        let data: RotinaJobData;
        try {
            data = JSON.parse(msg.content.toString()) as RotinaJobData;
        } catch {
            channel.ack(msg);
            return;
        }

        const workerOk = await this.isInstitutionWorkerConsuming(data.instituicaoCodigo);
        if (!workerOk) {
            channel.nack(msg, false, true);
            return;
        }

        const retryCount = this.getRetryCount(msg);
        if (retryCount >= MAX_RETRIES) {
            await this.sendToFinalDlq(msg, data, 'Max retries reached');
            channel.ack(msg);
            await updateExecLog(this.prisma, data.exeId, StatusExecucao.ERRO, 'Máximo de tentativas atingido');
            return;
        }

        const exec = await this.prisma.rOTExecucaoLog.findFirst({
            where: { EXEIdExterno: data.exeId },
            select: { EXEStatus: true },
        });
        if (exec?.EXEStatus === StatusExecucao.CANCELADO) {
            channel.ack(msg);
            return;
        }

        const tenantLimit = this.tenantLimits.get(data.instituicaoCodigo) ?? await this.loadTenantLimit(data.instituicaoCodigo);
        const acquired = await this.tryAcquireTenantSlot(
            data.instituicaoCodigo,
            tenantLimit,
            data.exeId,
        );
        if (!acquired) {
            const republished = this.republishToTenantMainQueue(channel, msg, data.instituicaoCodigo);
            if (republished) {
                channel.ack(msg);
            } else {
                channel.nack(msg, false, true);
            }
            return;
        }

        let tenantStillHeld = true;
        let serialAcquired = false;
        let jobSucceeded = false;
        try {
            const rotinaMeta = await this.prisma.rOTRotina.findFirst({
                where: {
                    ROTCodigo: data.rotinaCodigo,
                    INSInstituicaoCodigo: data.instituicaoCodigo,
                },
                select: { ROTPermiteParalelismo: true },
            });

            if (rotinaMeta && rotinaMeta.ROTPermiteParalelismo === false) {
                const gotSerial = await this.tryAcquireRotinaSerialSlot(
                    data.instituicaoCodigo,
                    data.rotinaCodigo,
                    data.exeId,
                );
                if (!gotSerial) {
                    const republished = this.republishToTenantMainQueue(channel, msg, data.instituicaoCodigo);
                    await this.releaseTenantSlot(data.instituicaoCodigo, data.exeId);
                    tenantStillHeld = false;
                    if (republished) {
                        channel.ack(msg);
                    } else {
                        channel.nack(msg, false, true);
                    }
                    return;
                }
                serialAcquired = true;
            }

            await this.clearPendingMarker(data.exeId);
            await this.processJob(data);
            jobSucceeded = true;
        } catch (error: any) {
            console.error(
                workerLogLine(`Job ${data.exeId} error:`),
                error?.message ?? error,
            );
        } finally {
            if (serialAcquired) {
                await this.releaseRotinaSerialSlot(data.instituicaoCodigo, data.rotinaCodigo, data.exeId);
            }
            if (tenantStillHeld) {
                await this.releaseTenantSlot(data.instituicaoCodigo, data.exeId);
            }
        }

        if (jobSucceeded) {
            channel.ack(msg);
        } else {
            channel.nack(msg, false, false);
        }
    }

    /** Um log EM_EXECUCAO + exeId único: redelivery Rabbit reusa a mesma linha até SUCESSO/ERRO/TIMEOUT/CANCELADO. */
    private async processJob(jobData: RotinaJobData) {
        const { exeId, rotinaCodigo, instituicaoCodigo, requestEnvelope } = jobData;
        console.log(workerLogLine(`Processing job ${exeId} (rotina=${rotinaCodigo}, trigger=${jobData.trigger})`));
        const rotina = await this.prisma.rOTRotina.findFirst({
            where: { ROTCodigo: rotinaCodigo, INSInstituicaoCodigo: instituicaoCodigo },
            include: { instituicao: true },
        });

        if (!rotina) {
            await updateExecLog(this.prisma, exeId, StatusExecucao.ERRO, 'Rotina não encontrada');
            throw new Error('Rotina não encontrada');
        }

        const { context, rpcHandler } = buildContext(this.prisma, instituicaoCodigo, requestEnvelope);
        const result = await this.processManager.executeInProcess(
            exeId,
            rotinaCodigo,
            rotina.ROTCodigoJS,
            context,
            rotina.ROTTimeoutSeconds,
            rpcHandler,
        );

        const finalStatus = result.cancelled
            ? StatusExecucao.CANCELADO
            : result.timedOut
                ? StatusExecucao.TIMEOUT
                : result.success
                    ? StatusExecucao.SUCESSO
                    : StatusExecucao.ERRO;

        const fim = new Date();
        await this.prisma.rOTExecucaoLog.updateMany({
            where: { EXEIdExterno: exeId },
            data: {
                EXEStatus: finalStatus,
                EXEFim: fim,
                EXEDuracaoMs: result.duration,
                EXEResultado: result.result ?? undefined,
                EXEErro: result.error,
                EXELogs: result.logs as any,
            },
        });

        await this.prisma.rOTRotina.update({
            where: { ROTCodigo: rotinaCodigo },
            data: { ROTUltimaExecucao: fim },
        });

        await this.redis.publish(channelFinished(exeId), JSON.stringify({
            success: result.success,
            result: result.result,
            error: result.error,
            duration: result.duration,
            status: finalStatus,
        }));

        console.log(workerLogLine(`Job ${exeId} completed`));
    }

    private async isInstitutionWorkerConsuming(instituicaoCodigo: number): Promise<boolean> {
        const inst = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: { INSAtivo: true, INSWorkerAtivo: true },
        });
        return !!(inst?.INSAtivo && inst.INSWorkerAtivo);
    }

    private async loadTenantLimit(instituicaoCodigo: number): Promise<number> {
        const tenant = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: { INSMaxExecucoesSimultaneas: true },
        });
        const limit = tenant?.INSMaxExecucoesSimultaneas || 8;
        this.tenantLimits.set(instituicaoCodigo, limit);
        return limit;
    }

    private async clearPendingMarker(exeId: string): Promise<void> {
        try {
            await this.redis.del(redisPendingKey(exeId));
        } catch {
            /* ignore */
        }
    }

    /** Limite por instituição via ZSET: membros expirados liberam vaga sem DECR manual. */
    private async tryAcquireTenantSlot(
        instituicaoCodigo: number,
        limit: number,
        exeId: string,
    ): Promise<boolean> {
        const zkey = redisInflightZkey(instituicaoCodigo);
        const now = Date.now();
        const until = now + INFLIGHT_LEASE_MS;
        const result = await this.redis.eval(
            `local zkey = KEYS[1]
             local now = tonumber(ARGV[1])
             local maxv = tonumber(ARGV[2])
             local exe = ARGV[3]
             local untilScore = tonumber(ARGV[4])
             redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
             local n = redis.call('ZCARD', zkey)
             if n < maxv then
               redis.call('ZADD', zkey, untilScore, exe)
               return 1
             end
             return 0`,
            1,
            zkey,
            String(now),
            String(limit),
            exeId,
            String(until),
        );
        return Number(result) === 1;
    }

    private async releaseTenantSlot(instituicaoCodigo: number, exeId: string) {
        const zkey = redisInflightZkey(instituicaoCodigo);
        await this.redis.eval(`redis.call('ZREM', KEYS[1], ARGV[1])`, 1, zkey, exeId);
    }

    private serialRotinaInflightZkeyFor(instituicaoCodigo: number, rotinaCodigo: number): string {
        return redisSerialInflightZkey(instituicaoCodigo, rotinaCodigo);
    }

    /** Uma execução por rotina (quando ROTPermiteParalelismo = false): ZSET com limite 1 e lease. */
    private async tryAcquireRotinaSerialSlot(
        instituicaoCodigo: number,
        rotinaCodigo: number,
        exeId: string,
    ): Promise<boolean> {
        const zkey = this.serialRotinaInflightZkeyFor(instituicaoCodigo, rotinaCodigo);
        const now = Date.now();
        const until = now + INFLIGHT_LEASE_MS;
        const result = await this.redis.eval(
            `local zkey = KEYS[1]
             local now = tonumber(ARGV[1])
             local maxv = tonumber(ARGV[2])
             local exe = ARGV[3]
             local untilScore = tonumber(ARGV[4])
             redis.call('ZREMRANGEBYSCORE', zkey, '-inf', now)
             local n = redis.call('ZCARD', zkey)
             if n < maxv then
               redis.call('ZADD', zkey, untilScore, exe)
               return 1
             end
             return 0`,
            1,
            zkey,
            String(now),
            '1',
            exeId,
            String(until),
        );
        return Number(result) === 1;
    }

    private async releaseRotinaSerialSlot(instituicaoCodigo: number, rotinaCodigo: number, exeId: string) {
        const zkey = this.serialRotinaInflightZkeyFor(instituicaoCodigo, rotinaCodigo);
        await this.redis.eval(`redis.call('ZREM', KEYS[1], ARGV[1])`, 1, zkey, exeId);
    }

    /**
     * Recoloca o job no exchange principal (fim da fila da instituição) sem DLX.
     * Preserva headers, em especial {@link RETRY_HEADER} — não conta como nova tentativa de falha.
     */
    private republishToTenantMainQueue(ch: amqp.Channel, msg: ConsumeMessage, instituicaoCodigo: number): boolean {
        const headers = { ...(msg.properties.headers || {}) };
        const properties: Options.Publish = {
            persistent: true,
            headers,
            messageId: msg.properties.messageId,
            correlationId: msg.properties.correlationId,
            contentType: msg.properties.contentType || 'application/json',
            timestamp: Date.now(),
        };
        return ch.publish(getJobsExchange(), String(instituicaoCodigo), msg.content, properties);
    }

    private getRetryCount(msg: ConsumeMessage): number {
        return Number(msg.properties.headers?.[RETRY_HEADER] ?? 0);
    }

    private async sendToFinalDlq(msg: ConsumeMessage, data: RotinaJobData, reason: string) {
        const pubChannel = this.channel || this.retryChannel;
        if (!pubChannel) return;
        const headers = {
            ...(msg.properties.headers || {}),
            'x-final-reason': reason,
        };
        const options: Options.Publish = {
            persistent: true,
            headers,
            messageId: msg.properties.messageId || data.exeId,
            correlationId: msg.properties.correlationId || data.exeId,
            contentType: 'application/json',
        };
        pubChannel.publish(getJobsDlxExchange(), 'final', msg.content, options);
    }
}

function buildContext(prisma: PrismaClient, instituicaoCodigo: number, requestData?: any) {
    const dbProxy = new DbTenantProxy(prisma, instituicaoCodigo);
    const realDb = dbProxy.createDbContext(ALLOWED_MODELS);
    const modelNames = Object.keys(realDb);

    const rpcHandler = async (method: string, params: any) => {
        if (method === 'db.query') {
            const { model, method: dbMethod, args } = params;
            if (!realDb[model]) throw new Error(`Access denied to model ${model}`);
            if (typeof realDb[model][dbMethod] !== 'function') throw new Error(`Method ${dbMethod} not found on model ${model}`);
            return realDb[model][dbMethod](...args);
        }
        throw new Error(`Unknown RPC method: ${method}`);
    };

    return {
        context: {
            instituicaoCodigo,
            logsDir: join(__dirname, '..', 'logs'),
            adapters: { equipamentos: [] },
            dbConfig: { models: modelNames, tables: SCHEMA_DEFINITION },
            request: requestData,
            manual: false,
        },
        rpcHandler,
    };
}

async function updateExecLog(prisma: PrismaClient, exeId: string, status: StatusExecucao, error?: string) {
    await prisma.rOTExecucaoLog.updateMany({
        where: { EXEIdExterno: exeId },
        data: {
            EXEStatus: status,
            EXEFim: new Date(),
            EXEErro: error,
        },
    });
}

