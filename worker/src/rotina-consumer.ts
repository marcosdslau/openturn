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
    GLOBAL_RETRY_QUEUE,
    INSTITUICAO_REFRESH_CHANNEL,
    JOBS_DLX_EXCHANGE,
    JOBS_DLX_QUEUE,
    JOBS_EXCHANGE,
    JOBS_RETRY_EXCHANGE,
    RETRY_DLX_ROUTING_KEY,
} from './rabbit-connection';

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
}

const WORKER_PREFETCH = 5;
const RETRY_TTL_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_HEADER = 'x-rotina-retry-count';
const POLL_INTERVAL_MS = 120000;

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
        await this.channel.prefetch(WORKER_PREFETCH, true);

        this.retryChannel = await this.connection.createChannel();
        await this.retryChannel.prefetch(50, false);

        await this.setupGlobalTopology();
        await this.startGlobalRetryConsumer();
        await this.startCancelListener();
        await this.startRefreshListener();
        await this.reconcileInstitutions();
        this.pollTimer = setInterval(() => {
            this.reconcileInstitutions().catch((err) => {
                console.error('[Worker] reconcile error:', err);
            });
        }, POLL_INTERVAL_MS);
        console.log(`[Worker] Rabbit consumer started (prefetch=${WORKER_PREFETCH})`);
    }

    async close() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        for (const [inst, tag] of this.consumerTags.entries()) {
            if (this.channel) await this.channel.cancel(tag);
            this.consumerTags.delete(inst);
        }
        await this.redisSub.unsubscribe(INSTITUICAO_REFRESH_CHANNEL, 'rotina:cancel');
        await this.redisSub.quit();
        await this.redis.quit();
        if (this.retryChannel) await this.retryChannel.close();
        if (this.channel) await this.channel.close();
        if (this.connection) await this.connection.close();
    }

    private async setupGlobalTopology() {
        if (!this.channel || !this.retryChannel) return;
        await this.channel.assertExchange(JOBS_EXCHANGE, 'direct', { durable: true });
        await this.channel.assertExchange(JOBS_RETRY_EXCHANGE, 'direct', { durable: true });
        await this.channel.assertExchange(JOBS_DLX_EXCHANGE, 'direct', { durable: true });
        await this.channel.assertQueue(JOBS_DLX_QUEUE, { durable: true });
        await this.channel.bindQueue(JOBS_DLX_QUEUE, JOBS_DLX_EXCHANGE, 'final');

        await this.retryChannel.assertQueue(GLOBAL_RETRY_QUEUE, { durable: true });
        await this.retryChannel.bindQueue(GLOBAL_RETRY_QUEUE, JOBS_RETRY_EXCHANGE, RETRY_DLX_ROUTING_KEY);
    }

    private async startGlobalRetryConsumer() {
        if (!this.retryChannel) return;
        await this.retryChannel.consume(GLOBAL_RETRY_QUEUE, (msg) => {
            this.onRetryQueueMessage(msg).catch((err) => {
                console.error('[Worker] retry consumer error:', err);
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

        ch.publish(JOBS_EXCHANGE, String(data.instituicaoCodigo), msg.content, properties);
        ch.ack(msg);
    }

    private async startCancelListener() {
        await this.redisSub.subscribe('rotina:cancel');
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
        await this.redisSub.subscribe(INSTITUICAO_REFRESH_CHANNEL);
        this.redisSub.on('message', (channel, message) => {
            if (channel !== INSTITUICAO_REFRESH_CHANNEL) return;
            this.handleRefreshMessage(message).catch((err) => {
                console.error('[Worker] refresh handler error:', err);
            });
        });
    }

    private async handleRefreshMessage(message: string) {
        const payload = JSON.parse(message) as InstituicaoAtiva;
        if (!payload?.INSCodigo) return;
        this.tenantLimits.set(payload.INSCodigo, payload.INSMaxExecucoesSimultaneas || 8);
        if (!payload.INSAtivo) {
            await this.stopConsumer(payload.INSCodigo);
            return;
        }
        await this.ensureTenantTopology(payload);
        await this.ensureTenantConsumer(payload);
    }

    private async reconcileInstitutions() {
        const instituicoes = await this.prisma.iNSInstituicao.findMany({
            where: { INSAtivo: true },
            select: {
                INSCodigo: true,
                INSAtivo: true,
                INSMaxExecucoesSimultaneas: true,
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
    }

    private async ensureTenantTopology(instituicao: InstituicaoAtiva) {
        if (!this.channel) return;
        const routingKey = String(instituicao.INSCodigo);
        const mainQueue = getMainQueueName(instituicao.INSCodigo);

        await this.channel.assertQueue(mainQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': JOBS_RETRY_EXCHANGE,
                'x-dead-letter-routing-key': RETRY_DLX_ROUTING_KEY,
            },
        });
        await this.channel.bindQueue(mainQueue, JOBS_EXCHANGE, routingKey);
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
        const acquired = await this.tryAcquireTenantSlot(data.instituicaoCodigo, tenantLimit);
        if (!acquired) {
            channel.nack(msg, false, false);
            return;
        }

        try {
            await this.processJob(data);
            channel.ack(msg);
        } catch (error: any) {
            // Republish / DLQ após MAX_RETRIES é tratado pelo consumer da fila global `q.rotina.retry`.
            channel.nack(msg, false, false);
        } finally {
            await this.releaseTenantSlot(data.instituicaoCodigo);
        }
    }

    private async processJob(jobData: RotinaJobData) {
        const { exeId, rotinaCodigo, instituicaoCodigo, requestEnvelope } = jobData;
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

        await this.redis.publish(`rotina:finished:${exeId}`, JSON.stringify({
            success: result.success,
            result: result.result,
            error: result.error,
            duration: result.duration,
            status: finalStatus,
        }));
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

    private async tryAcquireTenantSlot(instituicaoCodigo: number, limit: number): Promise<boolean> {
        const key = `rotina:inflight:${instituicaoCodigo}`;
        const result = await this.redis.eval(
            `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
             local maxv = tonumber(ARGV[1])
             if current < maxv then
               redis.call('INCR', KEYS[1])
               return 1
             end
             return 0`,
            1,
            key,
            String(limit),
        );
        return Number(result) === 1;
    }

    private async releaseTenantSlot(instituicaoCodigo: number) {
        const key = `rotina:inflight:${instituicaoCodigo}`;
        await this.redis.eval(
            `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
             if current <= 1 then
               redis.call('DEL', KEYS[1])
               return 0
             end
             return redis.call('DECR', KEYS[1])`,
            1,
            key,
        );
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
        pubChannel.publish(JOBS_DLX_EXCHANGE, 'final', msg.content, options);
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

