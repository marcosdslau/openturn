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
import { HardwareFactory } from './hardware/factory/hardware.factory';
import { HardwareResolver } from './hardware/hardware-resolver';
import {
    channelCancel,
    channelFinished,
    channelInstituicaoRefresh,
    channelRotinaRefresh,
    redisPendingKey,
    redisInflightZkey,
    redisRotinaParalelismoCacheInstPrefix,
    redisRotinaParalelismoCacheKey,
    redisSerialInflightZkey,
    redisSerialInflightPattern,
} from './redis-keys';
import {
    aggregateEntradaSaida,
    aggregateTempoPermanencia,
    aggregateTempoPermanenciaPeriodo,
    extractAffectedDayKeys,
    groupJanelasByPersonDay,
    type DiaAfetado,
    type JanelaAgregada,
    type PeriodoConfig,
} from './registro-diario-aggregation.helpers';
import { ErpFrequencySyncOrchestrator } from './erp-frequency/erp-frequency-sync.orchestrator';

export interface RotinaJobData {
    exeId: string;
    rotinaCodigo: number;
    instituicaoCodigo: number;
    trigger: 'SCHEDULE' | 'WEBHOOK' | 'INTERNAL';
    internalKind?: 'RPD_AGGREGATION' | 'FREQ_ERP_SYNC';
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
const SERIAL_BACKOFF_MS = 5000;
const CAPACITY_DEFER_MS = Math.max(
    0,
    parseInt(process.env.ROTINA_CAPACITY_DEFER_MS ?? '0', 10),
);
/**
 * Prefetch do canal dedicado à fila global de retry. Controla quantas mensagens
 * o consumer pega para `unacked` por vez. Valor baixo (ex.: 20) limita a vazão
 * de re-publish para a main queue, reduzindo a pressão sobre o tenant slot e
 * espaçando naturalmente as tentativas de rotinas serial em fila longa.
 * Mínimo 1.
 */
const RETRY_PREFETCH = Math.max(
    1,
    parseInt(process.env.ROTINA_RETRY_PREFETCH ?? '20', 10),
);
const CAPACITY_DEFERRED_HEADER = 'x-capacity-deferred';
/** Em conjunto com {@link SERIAL_INST_HEADER}: postergação serial não incrementa {@link RETRY_HEADER}. */
const SERIAL_DEFERRED_HEADER = 'x-serial-delayed';
const SERIAL_INST_HEADER = 'x-serial-inst';
/** Vaga no semáforo por instituição expira sozinha se o worker morrer após ZADD (ZSET score = deadline). */
const INFLIGHT_LEASE_MS = Math.max(
    60_000,
    parseInt(process.env.ROTINA_INFLIGHT_LEASE_SEC || String(3600), 10) * 1000,
);

const ALLOWED_MODELS = [
    'pESPessoa', 'mATMatricula', 'rEGRegistroPassagem',
    'eQPEquipamento', 'pESEquipamentoMapeamento', 'eRPConfiguracao', 'iNSInstituicao',
    'rPDRegistrosDiarios',
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
            { name: 'REGProcessado', type: 'Boolean' },
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
    RPDRegistrosDiarios: {
        alias: 'RegistroDiario',
        fields: [
            { name: 'RPDCodigo', type: 'Int', pk: true },
            { name: 'PESCodigo', type: 'Int', fk: 'PESPessoa' },
            { name: 'RPDData', type: 'DateTime' },
            { name: 'RPDDataEntrada', type: 'DateTime' },
            { name: 'RPDDataSaida', type: 'DateTime' },
            { name: 'RPDStatus', type: 'Enum' },
            { name: 'RPDResult', type: 'Json' },
            { name: 'createdAt', type: 'DateTime' },
            { name: 'updatedAt', type: 'DateTime' },
        ],
    },
};

export async function startConsumer(
    prisma: PrismaClient,
    processManager: WorkerProcessManager,
    redisOptions: RedisOptions,
    hardwareFactory: HardwareFactory,
) {
    const consumer = new RabbitRotinaConsumer(prisma, processManager, redisOptions, hardwareFactory);
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
    private readonly tenantStatus = new Map<number, { ativo: boolean; workerAtivo: boolean }>();
    /** null = rotina inexistente no último fetch; chave = redisRotinaParalelismoCacheKey (prefixo DEV|PRD + inst:rot). */
    private readonly rotinaParalelismoCache = new Map<string, boolean | null>();
    private readonly consumerTags = new Map<number, string>();
    private pollTimer: NodeJS.Timeout | null = null;
    /** Limpa semáforos Redis de inflight uma vez por processo (worker reiniciado = slots órfãos). */
    private coldStartInflightPurgeDone = false;
    private readonly erpFrequencySync: ErpFrequencySyncOrchestrator;

    constructor(
        private readonly prisma: PrismaClient,
        private readonly processManager: WorkerProcessManager,
        private readonly redisOptions: RedisOptions,
        private readonly hardwareFactory: HardwareFactory,
    ) {
        this.erpFrequencySync = new ErpFrequencySyncOrchestrator(prisma);
    }

    async start() {
        this.connection = await amqp.connect(getRabbitUrl());
        this.channel = await this.connection.createChannel();
        await this.channel.prefetch(MIN_PREFETCH, true);

        this.retryChannel = await this.connection.createChannel();
        // Configurável via ROTINA_RETRY_PREFETCH (default 20). Como `republishDeferredThroughGlobalRetry`
        // não usa mais `expiration`, mensagens que ficam na fila aguardando o consumer NÃO são
        // descartadas pelo broker — só esperam sua vez. Prefetch baixo espaça as tentativas.
        await this.retryChannel.prefetch(RETRY_PREFETCH, false);
        // Mensagens publicadas com `mandatory: true` que o broker não conseguir rotear
        // (fila da instituição inexistente / não bound) voltam pelo evento 'return'.
        // Repostamos na retry queue para nova tentativa após reconcileInstitutions().
        this.retryChannel.on('return', (returned) => {
            this.handleReturnedRetryPublish(returned);
        });

        await this.setupGlobalTopology();
        await this.startCancelListener();
        await this.startRefreshListener();
        // IMPORTANTE: criar/bindar as filas das instituições ANTES de iniciar o retry consumer.
        // O retry consumer re-publica mensagens em `getJobsExchange` com routing key = inst;
        // se a fila da instituição não estiver bound, o broker descarta silenciosamente
        // (mesmo com `mandatory: true`, perderíamos a oportunidade de roteamento direto).
        await this.reconcileInstitutions();
        await this.startGlobalRetryConsumer();
        this.pollTimer = setInterval(() => {
            this.reconcileInstitutions().catch((err) => {
                console.error(workerLogLine('reconcile error:'), err);
            });
        }, POLL_INTERVAL_MS);
        console.log(workerLogLine(`Rabbit consumer started (initial prefetch=${MIN_PREFETCH}, retry prefetch=${RETRY_PREFETCH})`));
    }

    async close() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        for (const [inst, tag] of this.consumerTags.entries()) {
            if (this.channel) await this.channel.cancel(tag);
            this.consumerTags.delete(inst);
        }
        await this.redisSub.unsubscribe(
            channelInstituicaoRefresh(),
            channelRotinaRefresh(),
            channelCancel(),
        );
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

        const hdrs = msg.properties.headers || {};
        const hasSerial = this.deferMarkerTruthy(hdrs, SERIAL_DEFERRED_HEADER);
        const hasCapacity = this.deferMarkerTruthy(hdrs, CAPACITY_DEFERRED_HEADER);
        const retryHdr = Number(hdrs[RETRY_HEADER] ?? 0);
        console.log(workerLogLine(
            `Retry consumer recebeu exeId=${data.exeId} inst=${data.instituicaoCodigo} ` +
            `serial=${hasSerial} capacity=${hasCapacity} retryCount=${retryHdr}`,
        ));

        const isSerialDelay = this.deferMarkerTruthy(msg.properties.headers, SERIAL_DEFERRED_HEADER);
        if (isSerialDelay) {
            await sleep(SERIAL_BACKOFF_MS);
            const headers = { ...(msg.properties.headers || {}) };
            delete headers[SERIAL_DEFERRED_HEADER];
            delete headers[SERIAL_INST_HEADER];
            const properties: Options.Publish = {
                persistent: true,
                headers,
                messageId: msg.properties.messageId || data.exeId,
                correlationId: msg.properties.correlationId || data.exeId,
                contentType: msg.properties.contentType || 'application/json',
                timestamp: Date.now(),
                mandatory: true,
            };
            const ok = ch.publish(getJobsExchange(), String(data.instituicaoCodigo), msg.content, properties);
            console.log(workerLogLine(
                `Retry[serial] exeId=${data.exeId} inst=${data.instituicaoCodigo} -> publish=${ok ? 'ok' : 'BUFFER_FULL'}`,
            ));
            if (ok) {
                ch.ack(msg);
            } else {
                // Channel buffer cheio: devolve para a retry queue para tentar de novo
                // sem perda. Não incrementa contador.
                ch.nack(msg, false, true);
            }
            return;
        }

        const isCapacityDeferred = this.deferMarkerTruthy(msg.properties.headers, CAPACITY_DEFERRED_HEADER);
        if (isCapacityDeferred) {
            await sleep(CAPACITY_DEFER_MS);
            const headers = { ...(msg.properties.headers || {}) };
            delete headers[CAPACITY_DEFERRED_HEADER];
            const properties: Options.Publish = {
                persistent: true,
                headers,
                messageId: msg.properties.messageId || data.exeId,
                correlationId: msg.properties.correlationId || data.exeId,
                contentType: msg.properties.contentType || 'application/json',
                timestamp: Date.now(),
                mandatory: true,
            };
            const ok = ch.publish(getJobsExchange(), String(data.instituicaoCodigo), msg.content, properties);
            console.log(workerLogLine(
                `Retry[capacity] exeId=${data.exeId} inst=${data.instituicaoCodigo} -> publish=${ok ? 'ok' : 'BUFFER_FULL'}`,
            ));
            if (ok) {
                ch.ack(msg);
            } else {
                ch.nack(msg, false, true);
            }
            return;
        }
        const prev = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0);
        const nextRetry = prev + 1;
        if (nextRetry > MAX_RETRIES) {
            await this.sendToFinalDlq(msg, data, 'Máximo de tentativas atingido (retry global)');
            ch.ack(msg);
            if (data.trigger !== 'INTERNAL') {
                await updateExecLog(this.prisma, data.exeId, StatusExecucao.ERRO, 'Máximo de tentativas atingido');
            }
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
            mandatory: true,
        };

        const ok = ch.publish(getJobsExchange(), String(data.instituicaoCodigo), msg.content, properties);
        if (ok) {
            ch.ack(msg);
        } else {
            ch.nack(msg, false, true);
        }
    }

    /**
     * Disparado quando o broker devolve uma mensagem publicada com `mandatory: true`
     * por não haver fila bound para a routing key (ex.: instituição ainda não reconciliada).
     * Reposta na própria retry queue mantendo `SERIAL_DEFERRED_HEADER` (se presente)
     * para nova tentativa após `reconcileInstitutions` rodar.
     */
    private handleReturnedRetryPublish(returned: ConsumeMessage) {
        if (!this.retryChannel) return;
        let exeId = 'unknown';
        let instituicaoCodigo: number | undefined;
        try {
            const data = JSON.parse(returned.content.toString()) as RotinaJobData;
            exeId = data.exeId;
            instituicaoCodigo = data.instituicaoCodigo;
        } catch {
            // ignore parse error
        }
        console.warn(workerLogLine(
            `Retry publish devolvido (instituicao=${instituicaoCodigo ?? '?'}, exeId=${exeId}, routingKey=${returned.fields.routingKey}) — repostando na retry queue.`,
        ));
        const prevHeaders = returned.properties.headers || {};
        const headers: Record<string, unknown> = { ...prevHeaders };
        if (this.deferMarkerTruthy(prevHeaders, CAPACITY_DEFERRED_HEADER)) {
            headers[CAPACITY_DEFERRED_HEADER] = true;
        } else {
            headers[SERIAL_DEFERRED_HEADER] = true;
            if (instituicaoCodigo != null) headers[SERIAL_INST_HEADER] = instituicaoCodigo;
        }
        const properties: Options.Publish = {
            persistent: true,
            headers,
            messageId: returned.properties.messageId,
            correlationId: returned.properties.correlationId,
            contentType: returned.properties.contentType || 'application/json',
            timestamp: Date.now(),
        };
        const ok = this.retryChannel.publish(
            getJobsRetryExchange(),
            RETRY_DLX_ROUTING_KEY,
            returned.content,
            properties,
        );
        if (!ok) {
            console.error(workerLogLine(
                `Falha ao repostar mensagem devolvida (exeId=${exeId}) — channel buffer cheio.`,
            ));
        }
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
        await this.redisSub.subscribe(channelInstituicaoRefresh(), channelRotinaRefresh());
        this.redisSub.on('message', (channel, message) => {
            if (channel === channelRotinaRefresh()) {
                this.handleRotinaRefreshMessage(message);
                return;
            }
            if (channel !== channelInstituicaoRefresh()) return;
            this.handleRefreshMessage(message).catch((err) => {
                console.error(workerLogLine('refresh handler error:'), err);
            });
        });
    }

    private handleRotinaRefreshMessage(message: string) {
        try {
            const parsed = JSON.parse(message) as { INSCodigo?: number; ROTCodigo?: number };
            if (parsed?.INSCodigo == null || parsed?.ROTCodigo == null) return;
            this.rotinaParalelismoCache.delete(
                redisRotinaParalelismoCacheKey(parsed.INSCodigo, parsed.ROTCodigo),
            );
        } catch {
            /* ignore */
        }
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
        this.tenantStatus.set(payload.INSCodigo, {
            ativo: !!payload.INSAtivo,
            workerAtivo: payload.INSWorkerAtivo !== false,
        });
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
        console.log(workerLogLine(
            `Reconcile instituições: ativas=${instituicoes.length} (${instituicoes.map((i) => i.INSCodigo).sort((a, b) => a - b).join(',')})`,
        ));

        if (!this.coldStartInflightPurgeDone) {
            for (const inst of instituicoes) {
                await this.purgeInstitutionInflightOnColdStart(inst.INSCodigo);
            }
            this.coldStartInflightPurgeDone = true;
        }

        const activeSet = new Set<number>();
        for (const instituicao of instituicoes) {
            activeSet.add(instituicao.INSCodigo);
            this.tenantLimits.set(instituicao.INSCodigo, instituicao.INSMaxExecucoesSimultaneas || 8);
            this.tenantStatus.set(instituicao.INSCodigo, {
                ativo: !!instituicao.INSAtivo,
                workerAtivo: instituicao.INSWorkerAtivo !== false,
            });
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
        this.tenantLimits.delete(instituicaoCodigo);
        this.tenantStatus.delete(instituicaoCodigo);
        const instPrefix = redisRotinaParalelismoCacheInstPrefix(instituicaoCodigo);
        for (const k of this.rotinaParalelismoCache.keys()) {
            if (k.startsWith(instPrefix)) this.rotinaParalelismoCache.delete(k);
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

        // Rotinas serial (ROTPermiteParalelismo=false) NUNCA podem ser descartadas por
        // esgotamento de tentativas: precisam ficar girando até processar com sucesso ou
        // serem canceladas explicitamente. INTERNAL não tem rotina, então é tratado depois.
        const rotinaMeta =
            data.trigger !== 'INTERNAL'
                ? await this.loadRotinaParalelismoMeta(
                      data.instituicaoCodigo,
                      data.rotinaCodigo,
                  )
                : null;
        const isSerialRotina = rotinaMeta?.ROTPermiteParalelismo === false;

        const retryCount = this.getRetryCount(msg);
        if (retryCount >= MAX_RETRIES) {
            if (isSerialRotina) {
                // Rotina serial atingiu MAX_RETRIES devido a falhas reais de processJob
                // (ex.: equipamento offline). Resetar contador e re-deferir em loop.
                console.warn(workerLogLine(
                    `Job ${data.exeId} (rotina serial=${data.rotinaCodigo}) atingiu MAX_RETRIES — resetando e re-deferindo.`,
                ));
                const republished = this.republishWithDelay(channel, msg, data.instituicaoCodigo);
                if (republished) {
                    channel.ack(msg);
                } else {
                    channel.nack(msg, false, true);
                }
                return;
            }
            await this.sendToFinalDlq(msg, data, 'Max retries reached');
            channel.ack(msg);
            if (data.trigger !== 'INTERNAL') {
                await updateExecLog(this.prisma, data.exeId, StatusExecucao.ERRO, 'Máximo de tentativas atingido');
            }
            return;
        }

        const exec = await this.prisma.rOTExecucaoLog.findFirst({
            where: { EXEIdExterno: data.exeId },
            select: { EXEStatus: true },
        });
        if (!exec) {
            // Com createMany antes da publicação isso não deveria acontecer; ainda assim,
            // se houver lag de réplica/transação não comitada, joga para a DLX para retry
            // com backoff. Após MAX_RETRIES o consumer da retry envia para DLQ final.
            console.warn(workerLogLine(
                `Job ${data.exeId} sem ROTExecucaoLog — devolvendo para retry (DLX).`,
            ));
            channel.nack(msg, false, false);
            return;
        }
        if (exec.EXEStatus === StatusExecucao.CANCELADO) {
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
            const republished =
                CAPACITY_DEFER_MS > 0
                    ? this.republishWithCapacityDefer(channel, msg, data.instituicaoCodigo)
                    : this.republishToTenantMainQueue(channel, msg, data.instituicaoCodigo);
            if (republished) {
                channel.ack(msg);
            } else {
                channel.nack(msg, false, true);
            }
            return;
        }

        if (data.trigger === 'INTERNAL') {
            const kind = data.internalKind ?? 'RPD_AGGREGATION';
            let internalOk = false;
            let internalError: string | undefined;
            const startedAt = Date.now();
            try {
                await this.clearPendingMarker(data.exeId);
                switch (kind) {
                    case 'RPD_AGGREGATION':
                        await this.processRegistroDiarioAggregation(data.instituicaoCodigo);
                        break;
                    case 'FREQ_ERP_SYNC':
                        await this.erpFrequencySync.run(data.instituicaoCodigo);
                        break;
                    default:
                        console.warn(workerLogLine(`INTERNAL kind desconhecido: ${kind}`));
                }
                internalOk = true;
            } catch (err: any) {
                internalError = err?.message ?? String(err);
                console.error(workerLogLine(`INTERNAL job ${data.exeId} (kind=${kind}) error:`), internalError);
            } finally {
                try {
                    await this.prisma.rOTExecucaoLog.updateMany({
                        where: { EXEIdExterno: data.exeId },
                        data: {
                            EXEStatus: internalOk ? StatusExecucao.SUCESSO : StatusExecucao.ERRO,
                            EXEFim: new Date(),
                            EXEDuracaoMs: Date.now() - startedAt,
                            EXEErro: internalOk ? null : internalError,
                        },
                    });
                } catch (updateErr) {
                    console.error(workerLogLine(`Failed to update execution log for INTERNAL ${data.exeId}:`), updateErr);
                }
                try {
                    await this.releaseTenantSlot(data.instituicaoCodigo, data.exeId);
                } catch (releaseErr) {
                    console.error(workerLogLine(`Failed to release tenant slot for INTERNAL ${data.exeId}:`), releaseErr);
                }
            }
            if (internalOk) {
                channel.ack(msg);
            } else {
                channel.nack(msg, false, false);
            }
            return;
        }

        let tenantStillHeld = true;
        let serialAcquired = false;
        let jobSucceeded = false;
        try {
            if (isSerialRotina) {
                const gotSerial = await this.tryAcquireRotinaSerialSlot(
                    data.instituicaoCodigo,
                    data.rotinaCodigo,
                    data.exeId,
                );
                if (!gotSerial) {
                    try {
                        await this.releaseTenantSlot(data.instituicaoCodigo, data.exeId);
                    } catch (releaseErr) {
                        console.error(workerLogLine(`Failed to release tenant slot for ${data.exeId} (serial backoff):`), releaseErr);
                    }
                    tenantStillHeld = false;
                    const republished = this.republishWithDelay(channel, msg, data.instituicaoCodigo);
                    if (republished) {
                        channel.ack(msg);
                    } else {
                        // Channel write buffer cheio / publish rejeitado: devolve com requeue
                        // para que outro consumer (ou este mesmo) tente de novo, sem perda.
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
                try {
                    await this.releaseRotinaSerialSlot(data.instituicaoCodigo, data.rotinaCodigo, data.exeId);
                } catch (releaseErr) {
                    console.error(workerLogLine(`Failed to release serial slot for ${data.exeId}:`), releaseErr);
                }
            }
            if (tenantStillHeld) {
                try {
                    await this.releaseTenantSlot(data.instituicaoCodigo, data.exeId);
                } catch (releaseErr) {
                    console.error(workerLogLine(`Failed to release tenant slot for ${data.exeId}:`), releaseErr);
                }
            }
        }

        if (jobSucceeded) {
            channel.ack(msg);
        } else if (isSerialRotina) {
            // Rotina serial não pode ser descartada por MAX_RETRIES. Republica como
            // serial defer (que não incrementa RETRY_HEADER) para nova tentativa.
            const republished = this.republishWithDelay(channel, msg, data.instituicaoCodigo);
            if (republished) {
                channel.ack(msg);
            } else {
                channel.nack(msg, false, true);
            }
        } else {
            channel.nack(msg, false, false);
        }
    }

    /**
     * Agrega passagens não processadas (REGProcessado=false) em RPDRegistrosDiarios.
     * Lê INSAglutinacaoRegistros e aplica a estratégia correspondente.
     * Para cada (PESCodigo, dia) com pendentes, recomputa o dia inteiro (delete + insert).
     */
    private async processRegistroDiarioAggregation(instituicaoCodigo: number) {
        console.log(workerLogLine(`[INTERNAL] Iniciando agregação de registros diários para inst=${instituicaoCodigo}`));

        const inst = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: { INSAglutinacaoRegistros: true, INSFusoHorario: true, INSAglutinacaoAutoCompletePeriodo: true },
        });
        const modo = inst?.INSAglutinacaoRegistros ?? 'entrada_saida';
        const fusoHorario = inst?.INSFusoHorario ?? -3;
        const autoCompletePeriodo = inst?.INSAglutinacaoAutoCompletePeriodo ?? false;

        const pendentes = await this.prisma.rEGRegistroPassagem.findMany({
            where: { INSInstituicaoCodigo: instituicaoCodigo, REGProcessado: false },
            select: { REGCodigo: true, PESCodigo: true, REGDataHora: true, REGAcao: true },
            orderBy: { REGDataHora: 'asc' },
        });

        if (pendentes.length === 0) {
            console.log(workerLogLine(`[INTERNAL] Nenhuma passagem pendente para inst=${instituicaoCodigo}`));
            return;
        }

        const diasAfetados = extractAffectedDayKeys(pendentes);

        const allPassagens = await this.loadPassagensForDayKeys(instituicaoCodigo, diasAfetados);

        let periodos: PeriodoConfig[] = [];
        if (modo === 'tempo_permanencia_periodo') {
            periodos = await this.prisma.pERPeriodosConfig.findMany({
                where: { INSInstituicaoCodigo: instituicaoCodigo },
                orderBy: { PERHorarioInicio: 'asc' },
                select: {
                    PERCodigo: true,
                    PERHorarioInicio: true,
                    PERHorarioFim: true,
                    PERToleranciaEntradaMinutos: true,
                    PERToleranciaSaidaMinutos: true,
                },
            });
            if (periodos.length === 0) {
                console.warn(workerLogLine(`[INTERNAL] inst=${instituicaoCodigo} modo periodo sem PERPeriodosConfig cadastrados — job ignorado`));
                return;
            }
        }

        let janelas: JanelaAgregada[];
        switch (modo) {
            case 'tempo_permanencia':
                janelas = aggregateTempoPermanencia(allPassagens);
                break;
            case 'tempo_permanencia_periodo':
                janelas = aggregateTempoPermanenciaPeriodo(allPassagens, periodos, fusoHorario, {
                    autoComplete: autoCompletePeriodo,
                    nowUtc: new Date(),
                });
                break;
            case 'entrada_saida':
            default:
                janelas = aggregateEntradaSaida(allPassagens);
                break;
        }

        const { daysRebuilt, totalJanelas, errors } = await this.persistJanelas(
            instituicaoCodigo,
            janelas,
            diasAfetados,
        );

        console.log(
            workerLogLine(
                `[INTERNAL] Agregação concluída para inst=${instituicaoCodigo}: modo=${modo} days_rebuilt=${daysRebuilt} janelas=${totalJanelas} errors=${errors}`,
            ),
        );
    }

    /**
     * Carrega todas as passagens (processadas ou não) dos dias afetados.
     * Garante que o reprocessamento do dia inteiro inclua passagens já processadas.
     */
    private async loadPassagensForDayKeys(
        instituicaoCodigo: number,
        diasAfetados: DiaAfetado[],
    ) {
        if (diasAfetados.length === 0) return [];
        return this.prisma.rEGRegistroPassagem.findMany({
            where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                OR: diasAfetados.map((d) => ({
                    PESCodigo: d.PESCodigo,
                    REGDataHora: { gte: d.inicio, lt: d.fim },
                })),
            },
            select: { REGCodigo: true, PESCodigo: true, REGDataHora: true, REGAcao: true },
            orderBy: { REGDataHora: 'asc' },
        });
    }

    /**
     * Persiste janelas calculadas substituindo os RPDs existentes do (pessoa, dia).
     * Por transação: deleteMany → create N janelas → marcar todas as passagens do dia como processadas.
     */
    private async persistJanelas(
        instituicaoCodigo: number,
        janelas: JanelaAgregada[],
        diasAfetados: DiaAfetado[],
    ): Promise<{ daysRebuilt: number; totalJanelas: number; errors: number }> {
        const byPersonDay = groupJanelasByPersonDay(janelas);
        let daysRebuilt = 0;
        let totalJanelas = 0;
        let errors = 0;

        for (const dia of diasAfetados) {
            const key = `${dia.PESCodigo}|${dia.dataLocal.getUTCFullYear()}-${String(dia.dataLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(dia.dataLocal.getUTCDate()).padStart(2, '0')}`;
            const dayJanelas = (byPersonDay.get(key) ?? []).sort(
                (a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice,
            );

            try {
                await this.prisma.$transaction(async (tx) => {
                    await tx.rPDRegistrosDiarios.deleteMany({
                        where: {
                            INSInstituicaoCodigo: instituicaoCodigo,
                            PESCodigo: dia.PESCodigo,
                            RPDData: dia.dataLocal,
                        },
                    });

                    for (const j of dayJanelas) {
                        await tx.rPDRegistrosDiarios.create({
                            data: {
                                INSInstituicaoCodigo: instituicaoCodigo,
                                PESCodigo: j.PESCodigo,
                                RPDData: j.dataLocal,
                                RPDJanelaIndice: j.RPDJanelaIndice,
                                RPDDataEntrada: j.RPDDataEntrada,
                                RPDDataSaida: j.RPDDataSaida,
                                PERCodigo: j.PERCodigo ?? null,
                            },
                        });
                    }

                    // Marcar todas as passagens do dia como processadas (não só as da janela)
                    await tx.rEGRegistroPassagem.updateMany({
                        where: {
                            INSInstituicaoCodigo: instituicaoCodigo,
                            PESCodigo: dia.PESCodigo,
                            REGDataHora: { gte: dia.inicio, lt: dia.fim },
                        },
                        data: { REGProcessado: true },
                    });
                });

                daysRebuilt++;
                totalJanelas += dayJanelas.length;
            } catch (err: any) {
                console.error(
                    workerLogLine(
                        `[INTERNAL] Erro ao persistir RPD pes=${dia.PESCodigo} data=${dia.dataLocal.toISOString()}: ${err?.message ?? err}`,
                    ),
                );
                errors++;
            }
        }

        return { daysRebuilt, totalJanelas, errors };
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

        const { context, rpcHandler } = buildContext(this.prisma, instituicaoCodigo, requestEnvelope, this.hardwareFactory);
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
        const cached = this.tenantStatus.get(instituicaoCodigo);
        if (cached !== undefined) {
            return cached.ativo && cached.workerAtivo;
        }
        const inst = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: { INSAtivo: true, INSWorkerAtivo: true },
        });
        if (!inst) {
            return false;
        }
        this.tenantStatus.set(instituicaoCodigo, {
            ativo: !!inst.INSAtivo,
            workerAtivo: inst.INSWorkerAtivo !== false,
        });
        return !!(inst.INSAtivo && inst.INSWorkerAtivo);
    }

    private async loadTenantLimit(instituicaoCodigo: number): Promise<number> {
        const tenant = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: {
                INSMaxExecucoesSimultaneas: true,
                INSAtivo: true,
                INSWorkerAtivo: true,
            },
        });
        const limit = tenant?.INSMaxExecucoesSimultaneas || 8;
        this.tenantLimits.set(instituicaoCodigo, limit);
        if (tenant) {
            this.tenantStatus.set(instituicaoCodigo, {
                ativo: !!tenant.INSAtivo,
                workerAtivo: tenant.INSWorkerAtivo !== false,
            });
        }
        return limit;
    }

    private async loadRotinaParalelismoMeta(
        instituicaoCodigo: number,
        rotinaCodigo: number,
    ): Promise<{ ROTPermiteParalelismo: boolean } | null> {
        const key = redisRotinaParalelismoCacheKey(instituicaoCodigo, rotinaCodigo);
        if (this.rotinaParalelismoCache.has(key)) {
            const cached = this.rotinaParalelismoCache.get(key);
            if (cached === null) return null;
            if (typeof cached === 'boolean') {
                return { ROTPermiteParalelismo: cached };
            }
        }
        const row = await this.prisma.rOTRotina.findFirst({
            where: { ROTCodigo: rotinaCodigo, INSInstituicaoCodigo: instituicaoCodigo },
            select: { ROTPermiteParalelismo: true },
        });
        if (!row) {
            this.rotinaParalelismoCache.set(key, null);
            return null;
        }
        const permite = row.ROTPermiteParalelismo !== false;
        this.rotinaParalelismoCache.set(key, permite);
        return { ROTPermiteParalelismo: permite };
    }

    private async clearPendingMarker(exeId: string): Promise<void> {
        try {
            await this.redis.del(redisPendingKey(exeId));
        } catch {
            /* ignore */
        }
    }

    /** Limite por instituição via ZSET: membros expirados liberam vaga sem DECR manual. */
    private async purgeInstitutionInflightOnColdStart(instituicaoCodigo: number) {
        const tenantZkey = redisInflightZkey(instituicaoCodigo);
        const tenantMembers = await this.redis.zcard(tenantZkey);
        const serialPattern = redisSerialInflightPattern(instituicaoCodigo);
        const serialKeys = await this.redis.keys(serialPattern);
        if (tenantMembers > 0) {
            await this.redis.del(tenantZkey);
        }
        if (serialKeys.length > 0) {
            await this.redis.del(...serialKeys);
        }
        if (tenantMembers > 0 || serialKeys.length > 0) {
            console.warn(workerLogLine(
                `Cold start: inflight Redis limpo inst=${instituicaoCodigo} ` +
                `(tenant=${tenantMembers}, serialZsets=${serialKeys.length})`,
            ));
        }
    }

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
    /**
     * Reseta {@link RETRY_HEADER} no objeto de headers fornecido. Usado para rotinas
     * com {@code ROTPermiteParalelismo=false}: o contador de tentativas é descartado
     * para que a mensagem possa girar indefinidamente até processar com sucesso ou
     * ser cancelada explicitamente.
     */
    private stripRetryHeader(headers: Record<string, unknown>): Record<string, unknown> {
        const next = { ...headers };
        delete next[RETRY_HEADER];
        return next;
    }

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

    /**
     * Publica na fila global (`jobs.retry`): {@link onRetryQueueMessage} reconhece `deferHeaderKey`
     * e republica para a instituição **sem** incrementar {@link RETRY_HEADER} (defer, não falha).
     */
    private republishDeferredThroughGlobalRetry(
        ch: amqp.Channel,
        msg: ConsumeMessage,
        deferHeaderKey: string,
        _expirationMs: number,
        extraHeaders?: Record<string, unknown>,
        baseHeaders?: Record<string, unknown>,
    ): boolean {
        const headers: Record<string, unknown> = {
            ...(baseHeaders ?? msg.properties.headers ?? {}),
            [deferHeaderKey]: true,
            ...extraHeaders,
        };
        // ATENÇÃO: NÃO definir `expiration` aqui. A fila global de retry não tem
        // x-dead-letter-exchange (ver setupGlobalTopology), então qualquer mensagem
        // que expirar é descartada silenciosamente pelo broker. O delay correto é
        // aplicado por `sleep(...)` no `onRetryQueueMessage`, não por TTL.
        const properties: Options.Publish = {
            persistent: true,
            headers,
            messageId: msg.properties.messageId,
            correlationId: msg.properties.correlationId,
            contentType: msg.properties.contentType || 'application/json',
            timestamp: Date.now(),
        };
        return ch.publish(getJobsRetryExchange(), RETRY_DLX_ROUTING_KEY, msg.content, properties);
    }

    /** Header boolean (AMQP) por vezes chega compatível como string/`1`. */
    private deferMarkerTruthy(
        headers: Record<string, unknown> | undefined,
        deferHeaderKey: string,
    ): boolean {
        const v = headers?.[deferHeaderKey];
        return v === true || v === 'true' || v === 1;
    }

    /**
     * Slot serial indisponível ({@code ROTPermiteParalelismo=false}): mesmo contrato que
     * {@link republishWithCapacityDefer} via {@link republishDeferredThroughGlobalRetry}.
     * Garante limpeza do {@link RETRY_HEADER} para que rotinas serial nunca esgotem
     * tentativas em loop de defer.
     */
    private republishWithDelay(ch: amqp.Channel, msg: ConsumeMessage, instituicaoCodigo: number): boolean {
        const baseHeaders = this.stripRetryHeader(msg.properties.headers || {});
        return this.republishDeferredThroughGlobalRetry(
            ch,
            msg,
            SERIAL_DEFERRED_HEADER,
            SERIAL_BACKOFF_MS,
            { [SERIAL_INST_HEADER]: instituicaoCodigo },
            baseHeaders,
        );
    }

    /**
     * Semáforo por instituição cheio: reenfileira na fila global de retry para
     * {@link onRetryQueueMessage} aplicar {@link CAPACITY_DEFER_MS} sem incrementar {@link RETRY_HEADER}.
     */
    private republishWithCapacityDefer(ch: amqp.Channel, msg: ConsumeMessage, instituicaoCodigo: number): boolean {
        return this.republishDeferredThroughGlobalRetry(
            ch,
            msg,
            CAPACITY_DEFERRED_HEADER,
            CAPACITY_DEFER_MS,
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
        pubChannel.publish(getJobsDlxExchange(), 'final', msg.content, options);
    }
}

function buildContext(
    prisma: PrismaClient,
    instituicaoCodigo: number,
    requestData: any,
    hardwareFactory: HardwareFactory,
) {
    const dbProxy = new DbTenantProxy(prisma, instituicaoCodigo);
    const realDb = dbProxy.createDbContext(ALLOWED_MODELS);
    const modelNames = Object.keys(realDb);

    const hardwareResolver = new HardwareResolver(prisma, hardwareFactory, instituicaoCodigo);

    const rpcHandler = async (method: string, params: any) => {
        if (method === 'db.query') {
            const { model, method: dbMethod, args } = params;
            if (!realDb[model]) throw new Error(`Access denied to model ${model}`);
            if (typeof realDb[model][dbMethod] !== 'function') throw new Error(`Method ${dbMethod} not found on model ${model}`);
            return realDb[model][dbMethod](...args);
        }
        if (method === 'hardware.exec') {
            const { equipmentId, method: providerMethod, args } = params;
            return hardwareResolver.exec(equipmentId, providerMethod, args as unknown[]);
        }
        if (method === 'hardware.institution.exec') {
            const { method: instMethod, args } = params;
            if (instMethod === 'deletePersonAcrossInstitution') {
                const pescodigo = (args as unknown[])[0];
                if (typeof pescodigo !== 'number') {
                    throw new Error('deletePersonAcrossInstitution: pescodigo must be a number');
                }
                return hardwareResolver.deletePersonAcrossInstitution(pescodigo);
            }
            throw new Error(`Unknown institution hardware method: ${String(instMethod)}`);
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

