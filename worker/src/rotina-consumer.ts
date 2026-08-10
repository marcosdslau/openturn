import * as amqp from 'amqplib';
import type { ConsumeMessage, Options } from 'amqplib';
import { PrismaClient, StatusExecucao } from '@prisma/client';
import type { RedisOptions } from 'ioredis';
import { join } from 'path';
import { DbTenantProxy } from './engine/db-tenant-proxy';
import { WorkerProcessManager } from './engine/process-manager';
import { sanitizeForIpc } from './engine/sanitize-for-ipc';
import { createRedisClient } from './redis-connection';
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
    redisSerialWaitKey,
    redisSerialProcessingKey,
    redisSerialAttemptsKey,
    redisSerialPairsKey,
    redisSerialWaitPattern,
    redisSerialProcessingPattern,
    redisSerialWaitRegex,
    redisSerialProcessingRegex,
    redisRunningLockKey,
} from './redis-keys';
import {
    aggregateEntradaSaida,
    aggregateTempoPermanencia,
    aggregateTempoPermanenciaPeriodo,
    collectJanelasForLocalDay,
    diaOverlapsLocalToday,
    extractAffectedDayKeys,
    getInstitutionLocalDayBounds,
    groupJanelasByPersonDay,
    isSameRpdData,
    localDayBoundsFromIsoDate,
    reconciliarDiaAtual,
    type DiaAfetado,
    type JanelaAgregada,
    type PeriodoConfig,
    type ReconciliacaoResult,
} from './registro-diario-aggregation.helpers';
import { ErpFrequencySyncOrchestrator } from './erp-frequency/erp-frequency-sync.orchestrator';
import {
    tryAcquireOrEnqueueSerial,
    releaseSerialSlotAndPopNext,
    requeueAtHeadAndClaimNext,
    failSerialAttemptAndClaimNext,
    getSerialAttempts,
    reclaimOrphanSerialClaims,
} from './serial-wait-lock';
import { LeaseHeartbeat } from './serial-lease-heartbeat';

export interface RotinaJobData {
    exeId: string;
    rotinaCodigo: number;
    instituicaoCodigo: number;
    trigger: 'SCHEDULE' | 'WEBHOOK' | 'INTERNAL';
    internalKind?: 'RPD_AGGREGATION' | 'FREQ_ERP_SYNC';
    isLastRunOfDay?: boolean;
    /** FREQ_ERP_SYNC: dia civil local (`YYYY-MM-DD`) a reprocessar antes do envio. */
    diaAlvoLocal?: string;
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
/** Intervalo do tick de reconciliação/recuperação do estado serial (locks órfãos, claims presos, backlog). */
const SERIAL_RECONCILE_INTERVAL_MS = 30000;
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
/** Em conjunto com {@link SERIAL_INST_HEADER}: postergação serial não incrementa {@link RETRY_HEADER}. Mantido só para compatibilidade com mensagens já em trânsito antes do deploy — código novo não produz mais este header (ver `failSerialAttemptAndClaimNext`). */
const SERIAL_DEFERRED_HEADER = 'x-serial-delayed';
const SERIAL_INST_HEADER = 'x-serial-inst';
/**
 * Vaga no semáforo (por instituição e no lock serial) expira sozinha se o worker morrer —
 * ZSET score = deadline. Curto de propósito (default 120s): habilita 3 instâncias de worker
 * sem que um restart de uma instância prenda o lock de outra por horas. Jobs legitimamente
 * mais longos que isso são cobertos por {@link LeaseHeartbeat}, que renova o score periodicamente
 * enquanto o job roda de verdade.
 */
const INFLIGHT_LEASE_MS = Math.max(
    60_000,
    parseInt(process.env.ROTINA_INFLIGHT_LEASE_SEC || String(120), 10) * 1000,
);
/**
 * Teto absoluto de tempo para `processJob` (incluindo consultas Prisma/Redis fora do processo
 * filho) — garante que a entrega do RabbitMQ é sempre resolvida (ack/nack) com folga antes do
 * `consumer_timeout` do broker (30min por padrão), mesmo se algo travar fora do timeout próprio
 * do `WorkerProcessManager`. Se sua instalação tem rotinas legitimamente mais longas que isso,
 * aumente via `ROTINA_JOB_HARD_TIMEOUT_MS`.
 */
const ROTINA_JOB_HARD_TIMEOUT_MS = Math.max(
    30_000,
    parseInt(process.env.ROTINA_JOB_HARD_TIMEOUT_MS ?? '1500000', 10),
);
/** Teto de espera por uma vaga de capacidade do tenant durante o dreno serial — evita loop infinito. */
const TENANT_SLOT_WAIT_MS = Math.max(
    1000,
    parseInt(process.env.ROTINA_TENANT_SLOT_WAIT_MS ?? '60000', 10),
);
/** Tentativas máximas de uma rotina serial antes de finalizar como ERRO/DLQ e liberar a fila. */
const SERIAL_MAX_ATTEMPTS = Math.max(
    1,
    parseInt(process.env.ROTINA_SERIAL_MAX_ATTEMPTS ?? '5', 10),
);
const SERIAL_RETRY_BACKOFF_BASE_MS = Math.max(
    100,
    parseInt(process.env.ROTINA_SERIAL_RETRY_BACKOFF_MS ?? '5000', 10),
);
const SERIAL_RETRY_BACKOFF_CAP_MS = 60_000;
/** TTL do contador de tentativas serial no Redis — folga generosa sobre o pior caso de backoff acumulado. */
const SERIAL_ATTEMPTS_TTL_SEC = 3600;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
/** TTL do lock distribuído de execução (idempotência entre as N instâncias do worker) — cobre o teto de tempo por job com folga. */
const RUNNING_LOCK_TTL_MS = ROTINA_JOB_HARD_TIMEOUT_MS + 60_000;

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
            { name: 'EQPDataUltimaBusca', type: 'BigInt' },
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

/** Status finais de `ROTExecucaoLog` — usado como guard de idempotência contra redelivery/duplicidade. */
function isTerminalStatus(status: StatusExecucao): boolean {
    return (
        status === StatusExecucao.SUCESSO ||
        status === StatusExecucao.ERRO ||
        status === StatusExecucao.CANCELADO ||
        status === StatusExecucao.TIMEOUT
    );
}

type OnMessageOutcome =
    | { type: 'success' }
    | { type: 'duplicate' }
    | { type: 'enqueued'; ok: boolean }
    | { type: 'failure' };

type SettleAction = 'ack' | 'nack-requeue' | 'nack-discard';

class RabbitRotinaConsumer {
    private connection: amqp.ChannelModel | null = null;
    private channel: amqp.Channel | null = null;
    /** Canal só para a fila global de retry (evita prefetch global bloquear republish). */
    private retryChannel: amqp.Channel | null = null;
    private readonly redis = createRedisClient(this.redisOptions, 'main');
    private readonly redisSub = createRedisClient(this.redisOptions, 'sub');
    private readonly tenantLimits = new Map<number, number>();
    private readonly tenantStatus = new Map<number, { ativo: boolean; workerAtivo: boolean }>();
    /** null = rotina inexistente no último fetch; chave = redisRotinaParalelismoCacheKey (prefixo DEV|PRD + inst:rot). */
    private readonly rotinaParalelismoCache = new Map<string, boolean | null>();
    private readonly consumerTags = new Map<number, string>();
    private pollTimer: NodeJS.Timeout | null = null;
    private serialReconcileTimer: NodeJS.Timeout | null = null;
    private readonly erpFrequencySync: ErpFrequencySyncOrchestrator;
    /** Identifica esta instância do worker nos locks distribuídos (idempotência entre instâncias). */
    private readonly workerId = `${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
    private reconnecting = false;
    private reconnectAttempts = 0;
    private shuttingDown = false;

    constructor(
        private readonly prisma: PrismaClient,
        private readonly processManager: WorkerProcessManager,
        private readonly redisOptions: RedisOptions,
        private readonly hardwareFactory: HardwareFactory,
    ) {
        this.erpFrequencySync = new ErpFrequencySyncOrchestrator(prisma);
    }

    async start() {
        await this.connectRabbit();
        await this.startCancelListener();
        await this.startRefreshListener();
        await this.setupGlobalTopology();
        // IMPORTANTE: criar/bindar as filas das instituições ANTES de iniciar o retry consumer.
        // O retry consumer re-publica mensagens em `getJobsExchange` com routing key = inst;
        // se a fila da instituição não estiver bound, o broker descarta silenciosamente
        // (mesmo com `mandatory: true`, perderíamos a oportunidade de roteamento direto).
        await this.reconcileInstitutions();
        await this.startGlobalRetryConsumer();
        await this.recoverSerialState();
        this.pollTimer = setInterval(() => {
            this.reconcileInstitutions().catch((err) => {
                console.error(workerLogLine('reconcile error:'), err);
            });
        }, POLL_INTERVAL_MS);
        this.serialReconcileTimer = setInterval(() => {
            this.recoverSerialState().catch((err) => {
                console.error(workerLogLine('serial state recovery error:'), err);
            });
        }, SERIAL_RECONCILE_INTERVAL_MS);
        console.log(workerLogLine(`Rabbit consumer started (initial prefetch=${MIN_PREFETCH}, retry prefetch=${RETRY_PREFETCH})`));
    }

    async close() {
        this.shuttingDown = true;
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.serialReconcileTimer) clearInterval(this.serialReconcileTimer);
        for (const [inst, tag] of this.consumerTags.entries()) {
            if (this.channel) {
                try {
                    await this.channel.cancel(tag);
                } catch {
                    /* canal pode já estar fechado/quebrado */
                }
            }
            this.consumerTags.delete(inst);
        }
        try {
            await this.redisSub.unsubscribe(
                channelInstituicaoRefresh(),
                channelRotinaRefresh(),
                channelCancel(),
            );
        } catch {
            /* ignore */
        }
        await this.redisSub.quit();
        await this.redis.quit();
        if (this.retryChannel) {
            try { await this.retryChannel.close(); } catch { /* ignore */ }
        }
        if (this.channel) {
            try { await this.channel.close(); } catch { /* ignore */ }
        }
        if (this.connection) {
            try { await this.connection.close(); } catch { /* ignore */ }
        }
    }

    /**
     * Cria a conexão AMQP e os dois canais, com handlers de `error`/`close` obrigatórios.
     * Sem eles, o `'error'` emitido pela conexão (ex.: 406 PRECONDITION-FAILED por
     * `consumer_timeout`) não tinha nenhum listener e derrubava o processo Node inteiro
     * (`node:events:486 throw er`) — matando as N instâncias PM2/Windows Service de uma vez.
     */
    private async connectRabbit(): Promise<void> {
        this.connection = await amqp.connect(getRabbitUrl());
        this.connection.on('error', (err: Error) => {
            console.error(workerLogLine('Rabbit connection error:'), err?.message ?? err);
        });
        this.connection.on('close', () => {
            if (this.shuttingDown) return;
            console.warn(workerLogLine('Rabbit connection closed — agendando reconexão.'));
            this.scheduleReconnect();
        });

        this.channel = await this.connection.createChannel();
        this.channel.on('error', (err: Error) => {
            console.error(workerLogLine('Rabbit main channel error:'), err?.message ?? err);
        });
        this.channel.on('close', () => {
            if (this.shuttingDown) return;
            console.warn(workerLogLine('Rabbit main channel closed — agendando reconexão.'));
            this.scheduleReconnect();
        });
        await this.channel.prefetch(MIN_PREFETCH, true);

        this.retryChannel = await this.connection.createChannel();
        this.retryChannel.on('error', (err: Error) => {
            console.error(workerLogLine('Rabbit retry channel error:'), err?.message ?? err);
        });
        this.retryChannel.on('close', () => {
            if (this.shuttingDown) return;
            console.warn(workerLogLine('Rabbit retry channel closed — agendando reconexão.'));
            this.scheduleReconnect();
        });
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
    }

    /** Idempotente: múltiplos `close`/`error` (conexão + 2 canais) não geram reconexões concorrentes. */
    private scheduleReconnect(): void {
        if (this.reconnecting || this.shuttingDown) return;
        this.reconnecting = true;
        this.consumerTags.clear();
        const oldConnection = this.connection;
        this.channel = null;
        this.retryChannel = null;
        this.connection = null;
        if (oldConnection) {
            oldConnection.close().catch(() => {
                /* conexão já pode estar fechada/quebrada */
            });
        }
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** Math.min(this.reconnectAttempts, 5), RECONNECT_MAX_MS);
        this.reconnectAttempts++;
        console.warn(workerLogLine(`Reconectando ao RabbitMQ em ${delay}ms (tentativa ${this.reconnectAttempts})...`));
        setTimeout(() => {
            this.reconnectRabbit()
                .then(() => {
                    this.reconnectAttempts = 0;
                    this.reconnecting = false;
                    console.log(workerLogLine('Reconectado ao RabbitMQ com sucesso.'));
                })
                .catch((err) => {
                    console.error(workerLogLine('Falha ao reconectar ao RabbitMQ:'), err);
                    this.reconnecting = false;
                    this.scheduleReconnect();
                });
        }, delay);
    }

    private async reconnectRabbit(): Promise<void> {
        await this.connectRabbit();
        await this.setupGlobalTopology();
        await this.reconcileInstitutions();
        await this.startGlobalRetryConsumer();
        // Qualquer item que ficou em `processing`/com lock órfão durante a queda volta a
        // andar sozinho aqui — sem isso, dependia de uma mensagem "viva" chegar para o
        // mesmo par (instituição, rotina), que é exatamente o sintoma relatado em produção.
        await this.recoverSerialState();
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

        // Compatibilidade com mensagens já em trânsito antes do deploy desta versão — código
        // novo não produz mais SERIAL_DEFERRED_HEADER (rotinas serial usam exclusivamente o
        // caminho Redis wait/processing + attempts, ver `failSerialAttemptAndClaimNext`).
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
            this.sendToFinalDlq(msg.content, msg.properties.headers, data.exeId, 'Máximo de tentativas atingido (retry global)');
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
            (msg) => {
                // Defesa em profundidade: `onMessage` já garante settle único internamente,
                // mas um throw síncrono antes do seu próprio try/catch (não deveria acontecer,
                // mas se acontecer) não pode virar unhandled rejection.
                this.onMessage(msg).catch((err) => {
                    console.error(workerLogLine('onMessage unhandled error:'), err);
                });
            },
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

    /**
     * Corre uma promise contra um teto absoluto de tempo — garante que a entrega do RabbitMQ
     * é sempre resolvida (ack/nack) mesmo se algo travar fora do timeout próprio do processo
     * filho (ex.: uma consulta Prisma presa por esgotamento do pool de conexões). Não cancela
     * de fato a promise original (ela continua rodando em segundo plano até settlar sozinha);
     * o objetivo é só limitar quanto tempo `onMessage` fica sem decidir ack/nack.
     */
    private async withHardTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
        let timer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(
                    `Hard timeout de ${ROTINA_JOB_HARD_TIMEOUT_MS}ms excedido: ${label}. ` +
                    'Se a rotina é legitimamente mais longa que isso, aumente ROTINA_JOB_HARD_TIMEOUT_MS.',
                ));
            }, ROTINA_JOB_HARD_TIMEOUT_MS);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timer);
        }
    }

    private async onMessage(msg: ConsumeMessage | null): Promise<void> {
        if (!msg || !this.channel) return;
        const channel = this.channel;

        let settled = false;
        const settle = (action: SettleAction) => {
            if (settled) return;
            settled = true;
            try {
                if (action === 'ack') channel.ack(msg);
                else if (action === 'nack-requeue') channel.nack(msg, false, true);
                else channel.nack(msg, false, false);
            } catch (err) {
                console.error(workerLogLine(`Failed to settle message (${action}):`), err);
            }
        };

        try {
            let data: RotinaJobData;
            try {
                data = JSON.parse(msg.content.toString()) as RotinaJobData;
            } catch {
                settle('ack');
                return;
            }

            const workerOk = await this.isInstitutionWorkerConsuming(data.instituicaoCodigo);
            if (!workerOk) {
                settle('nack-requeue');
                return;
            }

            // Rotinas serial (ROTPermiteParalelismo=false) NUNCA podem ser descartadas por
            // esgotamento de tentativas do AMQP: a partir do primeiro enfileiramento no Redis,
            // toda a responsabilidade de retry passa a ser do par attempts/wait list — este
            // contador de headers do Rabbit deixa de se aplicar a elas.
            const rotinaMeta =
                data.trigger !== 'INTERNAL'
                    ? await this.loadRotinaParalelismoMeta(
                          data.instituicaoCodigo,
                          data.rotinaCodigo,
                      )
                    : null;
            const isSerialRotina = rotinaMeta?.ROTPermiteParalelismo === false;

            const retryCount = this.getRetryCount(msg);
            if (!isSerialRotina && retryCount >= MAX_RETRIES) {
                this.sendToFinalDlq(msg.content, msg.properties.headers, data.exeId, 'Max retries reached');
                settle('ack');
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
                settle('nack-discard');
                return;
            }
            if (isTerminalStatus(exec.EXEStatus)) {
                // Guard de idempotência: cobre redelivery da mesma mensagem (ex.: após
                // reconexão do canal por 406) cujo resultado já foi definitivamente decidido.
                console.warn(workerLogLine(
                    `Job ${data.exeId} já em status terminal (${exec.EXEStatus}) — ack sem reprocessar.`,
                ));
                settle('ack');
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
                settle(republished ? 'ack' : 'nack-requeue');
                return;
            }

            if (data.trigger === 'INTERNAL') {
                const internalOk = await this.runInternalJob(data);
                settle(internalOk ? 'ack' : 'nack-discard');
                return;
            }

            let tenantStillHeld = true;
            let serialAcquired = false;
            let outcome: OnMessageOutcome = { type: 'failure' };
            let runningLockAcquired = false;
            const heartbeats: LeaseHeartbeat[] = [];

            try {
                runningLockAcquired = await this.acquireRunningLock(data.exeId);
                if (!runningLockAcquired) {
                    // Outra instância do worker já está processando este exeId (corrida entre
                    // instâncias, ou redelivery concorrente) — não roda de novo.
                    console.warn(workerLogLine(
                        `Job ${data.exeId} já em execução em outra instância — ack sem reprocessar.`,
                    ));
                    outcome = { type: 'duplicate' };
                } else {
                    const tenantHeartbeat = new LeaseHeartbeat(
                        this.redis,
                        redisInflightZkey(data.instituicaoCodigo),
                        data.exeId,
                        INFLIGHT_LEASE_MS,
                    );
                    tenantHeartbeat.start();
                    heartbeats.push(tenantHeartbeat);

                    let canRun = true;
                    if (isSerialRotina) {
                        const { zkey, waitkey, processingkey } = this.serialKeys(data.instituicaoCodigo, data.rotinaCodigo);
                        const acquiredSerial = await tryAcquireOrEnqueueSerial(
                            this.redis, zkey, waitkey, processingkey, data.exeId, INFLIGHT_LEASE_MS,
                        );
                        await this.rememberSerialPair(data.instituicaoCodigo, data.rotinaCodigo);
                        if (!acquiredSerial) {
                            // Lock ocupado (ou já há fila de espera — FIFO estrito): a mensagem
                            // NÃO volta pro RabbitMQ. O exeId já está na lista Redis de espera;
                            // aqui só marcamos o status no log (fonte de verdade durável).
                            canRun = false;
                            try {
                                await this.releaseTenantSlot(data.instituicaoCodigo, data.exeId);
                            } catch (releaseErr) {
                                console.error(workerLogLine(`Failed to release tenant slot for ${data.exeId} (serial wait):`), releaseErr);
                            }
                            tenantStillHeld = false;
                            try {
                                await this.prisma.rOTExecucaoLog.updateMany({
                                    where: { EXEIdExterno: data.exeId },
                                    data: { EXEStatus: StatusExecucao.AGUARDANDO_LOCK_SERIAL },
                                });
                                outcome = { type: 'enqueued', ok: true };
                            } catch (updateErr) {
                                // exeId já está na lista Redis de espera; se o update no Postgres
                                // falhar, devolve pro broker (fallback ao comportamento antigo).
                                // Risco residual de duplicidade é mitigado pelo guard de status
                                // terminal + lock distribuído de execução.
                                console.error(workerLogLine(`Failed to mark ${data.exeId} as AGUARDANDO_LOCK_SERIAL — devolvendo para o broker:`), updateErr);
                                outcome = { type: 'enqueued', ok: false };
                            }
                        } else {
                            serialAcquired = true;
                            const serialHeartbeat = new LeaseHeartbeat(this.redis, zkey, data.exeId, INFLIGHT_LEASE_MS);
                            serialHeartbeat.start();
                            heartbeats.push(serialHeartbeat);
                        }
                    }

                    if (canRun) {
                        await this.clearPendingMarker(data.exeId);
                        const jobResult = await this.withHardTimeout(this.processJob(data), `processJob exeId=${data.exeId}`);
                        // Rotinas paralelas preservam o comportamento histórico: uma vez que
                        // processJob roda sem lançar exceção, a mensagem é sempre ack'ada
                        // (falha de negócio já foi persistida como ERRO pelo próprio processJob;
                        // não há mecanismo de retry por falha de negócio para elas). Rotinas
                        // serial passam a exigir sucesso de fato para não entrar no caminho de
                        // retry-na-cabeça-da-fila — essa é a mudança pedida (ex.: equipamento
                        // offline deve contar como tentativa falha).
                        const succeeded = isSerialRotina ? jobResult.success : true;
                        outcome = succeeded ? { type: 'success' } : { type: 'failure' };
                    }
                }
            } catch (error: any) {
                console.error(
                    workerLogLine(`Job ${data.exeId} error:`),
                    error?.message ?? error,
                );
                outcome = { type: 'failure' };
            } finally {
                for (const hb of heartbeats) hb.stop();
                if (runningLockAcquired) {
                    try {
                        await this.releaseRunningLock(data.exeId);
                    } catch (releaseErr) {
                        console.error(workerLogLine(`Failed to release running lock for ${data.exeId}:`), releaseErr);
                    }
                }
                if (serialAcquired) {
                    try {
                        if (outcome.type === 'success') {
                            const nextExeId = await this.releaseSerialSlotAndPopNext(
                                data.instituicaoCodigo,
                                data.rotinaCodigo,
                                data.exeId,
                            );
                            if (nextExeId) this.startDrainInBackground(data.instituicaoCodigo, data.rotinaCodigo, nextExeId);
                        } else {
                            const failOutcome = await this.failSerialAttempt(data.instituicaoCodigo, data.rotinaCodigo, data.exeId);
                            if (failOutcome.exhausted) {
                                await this.finalizeSerialExhausted(msg, data, failOutcome.attempts);
                            } else {
                                await this.prisma.rOTExecucaoLog.updateMany({
                                    where: { EXEIdExterno: data.exeId },
                                    data: { EXEStatus: StatusExecucao.AGUARDANDO_LOCK_SERIAL },
                                }).catch((err) => console.error(workerLogLine(`Failed to mark ${data.exeId} as AGUARDANDO_LOCK_SERIAL (retry):`), err));
                            }
                            if (failOutcome.nextExeId) this.startDrainInBackground(data.instituicaoCodigo, data.rotinaCodigo, failOutcome.nextExeId);
                        }
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

            switch (outcome.type) {
                case 'success':
                case 'duplicate':
                    settle('ack');
                    break;
                case 'enqueued':
                    settle(outcome.ok ? 'ack' : 'nack-requeue');
                    break;
                case 'failure':
                    // Rotina serial: responsabilidade já transferida integralmente para o
                    // Redis/Postgres (recolocada na cabeça da fila ou finalizada/DLQ) — a
                    // mensagem original do Rabbit está encerrada aqui de qualquer forma.
                    settle(isSerialRotina ? 'ack' : 'nack-discard');
                    break;
            }
        } catch (unexpected: any) {
            // Qualquer exceção não prevista antes de chegar num `settle(...)` explícito acima
            // (ex.: falha do Prisma/Redis num passo de setup) — devolve ao broker em vez de
            // deixar a entrega pendurada até o `consumer_timeout`.
            console.error(workerLogLine('onMessage unexpected error:'), unexpected?.message ?? unexpected);
            settle('nack-requeue');
        }
    }

    private async runInternalJob(data: RotinaJobData): Promise<boolean> {
        const kind = data.internalKind ?? 'RPD_AGGREGATION';
        let internalOk = false;
        let internalError: string | undefined;
        const startedAt = Date.now();
        try {
            await this.clearPendingMarker(data.exeId);
            await this.withHardTimeout((async () => {
                switch (kind) {
                    case 'RPD_AGGREGATION':
                        await this.processRegistroDiarioAggregation(
                            data.instituicaoCodigo,
                            data.isLastRunOfDay ?? false,
                        );
                        break;
                    case 'FREQ_ERP_SYNC':
                        // O dia alvo é reprocessado do zero (equivalente a "Reprocessar Período"
                        // de 1 dia): RPDs apagados e passagens devolvidas para não processadas.
                        await this.reprocessarDiaParaEnvio(
                            data.instituicaoCodigo,
                            data.diaAlvoLocal,
                        );
                        // Reagrega o dia alvo (agora pendente) + eventuais dias em atraso.
                        await this.processRegistroDiarioAggregation(
                            data.instituicaoCodigo,
                            data.isLastRunOfDay ?? true,
                        );
                        // RPDs recriados nascem PENDENTE — tudo do dia é (re)enviado ao ERP.
                        await this.erpFrequencySync.run(data.instituicaoCodigo);
                        break;
                    default:
                        console.warn(workerLogLine(`INTERNAL kind desconhecido: ${kind}`));
                }
            })(), `INTERNAL exeId=${data.exeId} kind=${kind}`);
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
        return internalOk;
    }

    /**
     * Reprocessa um dia inteiro antes do envio ao ERP — equivalente a
     * "Reprocessar Período" de um único dia: apaga os RPDs do dia (exceto MANUAL)
     * e devolve as passagens para REGProcessado=false, de modo que a agregação
     * seguinte reconstrua o dia e o envio reprocesse tudo, inclusive o que já
     * estava ENVIADO.
     *
     * `diaAlvoLocal` (YYYY-MM-DD) vem fixado da publicação do job; sem ele,
     * usa o dia local corrente.
     */
    private async reprocessarDiaParaEnvio(instituicaoCodigo: number, diaAlvoLocal?: string) {
        const inst = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: { INSFusoHorario: true },
        });
        const fusoHorario = inst?.INSFusoHorario ?? -3;

        const bounds = diaAlvoLocal
            ? localDayBoundsFromIsoDate(diaAlvoLocal, fusoHorario)
            : getInstitutionLocalDayBounds(new Date(), fusoHorario);

        const [rpds, passagens] = await this.prisma.$transaction([
            this.prisma.rPDRegistrosDiarios.deleteMany({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    RPDData: bounds.dataLocal,
                    RPDStatus: { not: 'MANUAL' },
                },
            }),
            this.prisma.rEGRegistroPassagem.updateMany({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    REGDataHora: { gte: bounds.inicio, lt: bounds.fim },
                },
                data: { REGProcessado: false },
            }),
        ]);

        console.log(
            workerLogLine(
                `[FREQ_ERP_SYNC] Reprocesso do dia ${bounds.dataLocal.toISOString().slice(0, 10)} inst=${instituicaoCodigo}: ` +
                `rpd_removidos=${rpds.count} passagens_resetadas=${passagens.count}`,
            ),
        );
    }

    /**
     * Agrega passagens em RPDRegistrosDiarios.
     * Dias passados: fluxo baseado em REGProcessado=false (delete + insert).
     * Dia atual (local): reconcilia todas as passagens (upsert/delete seletivo);
     * marca REGProcessado=true somente na última execução agendada do dia.
     */
    private async processRegistroDiarioAggregation(
        instituicaoCodigo: number,
        isLastRunOfDay: boolean,
    ) {
        console.log(
            workerLogLine(
                `[INTERNAL] Iniciando agregação de registros diários para inst=${instituicaoCodigo} isLastRunOfDay=${isLastRunOfDay}`,
            ),
        );

        const inst = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: { INSAglutinacaoRegistros: true, INSFusoHorario: true, INSAglutinacaoAutoCompletePeriodo: true },
        });
        const modo = inst?.INSAglutinacaoRegistros ?? 'entrada_saida';
        const fusoHorario = inst?.INSFusoHorario ?? -3;
        const autoCompletePeriodo = inst?.INSAglutinacaoAutoCompletePeriodo ?? false;
        const hojeBounds = getInstitutionLocalDayBounds(new Date(), fusoHorario);

        const pendentes = await this.prisma.rEGRegistroPassagem.findMany({
            where: { INSInstituicaoCodigo: instituicaoCodigo, REGProcessado: false },
            select: { REGCodigo: true, PESCodigo: true, REGDataHora: true, REGAcao: true },
            orderBy: { REGDataHora: 'asc' },
        });

        const diasPendentes = extractAffectedDayKeys(pendentes);
        const diasPassados = diasPendentes.filter((d) => !diaOverlapsLocalToday(d, hojeBounds));

        const passagensHoje = await this.prisma.rEGRegistroPassagem.findMany({
            where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                REGDataHora: { gte: hojeBounds.inicio, lt: hojeBounds.fim },
            },
            select: { PESCodigo: true },
            distinct: ['PESCodigo'],
        });

        const hojePessoas = new Set<number>(passagensHoje.map((p) => p.PESCodigo));
        for (const d of diasPendentes) {
            if (diaOverlapsLocalToday(d, hojeBounds)) {
                hojePessoas.add(d.PESCodigo);
            }
        }

        const diasHoje: DiaAfetado[] = [...hojePessoas].map((pesCodigo) => ({
            PESCodigo: pesCodigo,
            dataLocal: hojeBounds.dataLocal,
            inicio: hojeBounds.inicio,
            fim: hojeBounds.fim,
        }));

        const diasAfetados = [...diasPassados, ...diasHoje];

        if (diasAfetados.length === 0) {
            console.log(workerLogLine(`[INTERNAL] Nenhum dia afetado para inst=${instituicaoCodigo}`));
            return;
        }

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

        const byPersonDay = groupJanelasByPersonDay(janelas);
        let daysRebuilt = 0;
        let totalJanelas = 0;
        let errors = 0;
        let janelasCriadas = 0;
        let janelasAtualizadas = 0;
        let janelasRemovidas = 0;
        let colisoesProtegidas = 0;

        for (const dia of diasAfetados) {
            const isHoje = isSameRpdData(dia.dataLocal, hojeBounds.dataLocal);
            const dayJanelas = isHoje
                ? collectJanelasForLocalDay(janelas, dia.PESCodigo, hojeBounds)
                : (() => {
                      const key = `${dia.PESCodigo}|${dia.dataLocal.getUTCFullYear()}-${String(dia.dataLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(dia.dataLocal.getUTCDate()).padStart(2, '0')}`;
                      return (byPersonDay.get(key) ?? []).sort(
                          (a, b) => a.RPDJanelaIndice - b.RPDJanelaIndice,
                      );
                  })();

            try {
                if (isHoje) {
                    let stats: ReconciliacaoResult = {
                        criadas: 0,
                        atualizadas: 0,
                        removidas: 0,
                        colisoesProtegidas: 0,
                    };
                    await this.prisma.$transaction(async (tx) => {
                        stats = await reconciliarDiaAtual(
                            tx,
                            instituicaoCodigo,
                            dia.PESCodigo,
                            dia.dataLocal,
                            dayJanelas,
                            (msg) => console.warn(workerLogLine(`[INTERNAL] ${msg}`)),
                        );

                        if (isLastRunOfDay) {
                            await tx.rEGRegistroPassagem.updateMany({
                                where: {
                                    INSInstituicaoCodigo: instituicaoCodigo,
                                    PESCodigo: dia.PESCodigo,
                                    REGDataHora: { gte: dia.inicio, lt: dia.fim },
                                },
                                data: { REGProcessado: true },
                            });
                        }
                    });
                    janelasCriadas += stats.criadas;
                    janelasAtualizadas += stats.atualizadas;
                    janelasRemovidas += stats.removidas;
                    colisoesProtegidas += stats.colisoesProtegidas;
                    daysRebuilt++;
                    totalJanelas += dayJanelas.length;
                } else {
                    const result = await this.persistJanelas(
                        instituicaoCodigo,
                        janelas,
                        [dia],
                    );
                    daysRebuilt += result.daysRebuilt;
                    totalJanelas += result.totalJanelas;
                    errors += result.errors;
                }
            } catch (err: any) {
                console.error(
                    workerLogLine(
                        `[INTERNAL] Erro ao persistir RPD pes=${dia.PESCodigo} data=${dia.dataLocal.toISOString()} isHoje=${isHoje}: ${err?.message ?? err}`,
                    ),
                );
                errors++;
            }
        }

        console.log(
            workerLogLine(
                `[INTERNAL] Agregação concluída para inst=${instituicaoCodigo}: modo=${modo} isLastRunOfDay=${isLastRunOfDay} days_rebuilt=${daysRebuilt} janelas=${totalJanelas} janelas_criadas=${janelasCriadas} janelas_atualizadas=${janelasAtualizadas} janelas_removidas=${janelasRemovidas} colisoes_protegidas=${colisoesProtegidas} errors=${errors}`,
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
                    // Linhas MANUAL são preservadas (mesma regra do reprocessarPeriodo);
                    // os índices que elas ocupam ficam bloqueados para janelas computadas.
                    const manuais = await tx.rPDRegistrosDiarios.findMany({
                        where: {
                            INSInstituicaoCodigo: instituicaoCodigo,
                            PESCodigo: dia.PESCodigo,
                            RPDData: dia.dataLocal,
                            RPDStatus: 'MANUAL',
                        },
                        select: { RPDJanelaIndice: true },
                    });
                    const indicesManuais = new Set(manuais.map((m) => m.RPDJanelaIndice));

                    await tx.rPDRegistrosDiarios.deleteMany({
                        where: {
                            INSInstituicaoCodigo: instituicaoCodigo,
                            PESCodigo: dia.PESCodigo,
                            RPDData: dia.dataLocal,
                            RPDStatus: { not: 'MANUAL' },
                        },
                    });

                    for (const j of dayJanelas) {
                        if (indicesManuais.has(j.RPDJanelaIndice)) {
                            console.warn(
                                workerLogLine(
                                    `[INTERNAL] Colisão de índice ${j.RPDJanelaIndice} com linha MANUAL — pes=${j.PESCodigo} dia=${dia.dataLocal.toISOString()}, descartando janela computada`,
                                ),
                            );
                            continue;
                        }
                        if (j.RPDDataEntrada && j.RPDDataSaida && j.RPDDataEntrada > j.RPDDataSaida) {
                            console.warn(
                                workerLogLine(
                                    `[INTERNAL] Guard: janela ${j.RPDJanelaIndice} pes=${j.PESCodigo} entrada(${j.RPDDataEntrada.toISOString()}) > saida(${j.RPDDataSaida.toISOString()}) — descartando`,
                                ),
                            );
                            continue;
                        }
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
    private async processJob(jobData: RotinaJobData): Promise<{ success: boolean }> {
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

        return { success: finalStatus === StatusExecucao.SUCESSO };
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

    /** Agrupa as 3 chaves Redis usadas pelo lock serial de um par (instituição, rotina). */
    private serialKeys(instituicaoCodigo: number, rotinaCodigo: number) {
        return {
            zkey: this.serialRotinaInflightZkeyFor(instituicaoCodigo, rotinaCodigo),
            waitkey: redisSerialWaitKey(instituicaoCodigo, rotinaCodigo),
            processingkey: redisSerialProcessingKey(instituicaoCodigo, rotinaCodigo),
        };
    }

    /** Registra o par no índice durável (SET no Redis) usado por `recoverSerialState` — substitui o antigo Set em memória, que se perdia a cada restart. */
    private async rememberSerialPair(instituicaoCodigo: number, rotinaCodigo: number): Promise<void> {
        try {
            await this.redis.sadd(redisSerialPairsKey(), `${instituicaoCodigo}:${rotinaCodigo}`);
        } catch (err) {
            console.error(workerLogLine('Failed to remember serial pair:'), err);
        }
    }

    /**
     * Libera o slot do exeId informado e, no mesmo passo atômico, promove o próximo
     * item da lista de espera (se houver e o slot ficar livre). Qualquer instância do
     * worker pode ganhar essa corrida — não precisa ser a mesma que enfileirou.
     * Retorna o exeId promovido (já com o lock concedido), ou `null` se não havia nada
     * esperando.
     */
    private async releaseSerialSlotAndPopNext(
        instituicaoCodigo: number,
        rotinaCodigo: number,
        releasedExeId: string,
    ): Promise<string | null> {
        const { zkey, waitkey, processingkey } = this.serialKeys(instituicaoCodigo, rotinaCodigo);
        return releaseSerialSlotAndPopNext(this.redis, zkey, waitkey, processingkey, releasedExeId, INFLIGHT_LEASE_MS);
    }

    /** Registra uma falha real de processamento e decide (via Lua atômico) recolocar na cabeça ou finalizar por esgotamento de tentativas. */
    private async failSerialAttempt(instituicaoCodigo: number, rotinaCodigo: number, exeId: string) {
        const { zkey, waitkey, processingkey } = this.serialKeys(instituicaoCodigo, rotinaCodigo);
        const attemptsKey = redisSerialAttemptsKey(instituicaoCodigo, rotinaCodigo, exeId);
        return failSerialAttemptAndClaimNext(
            this.redis, zkey, waitkey, processingkey, attemptsKey, exeId,
            SERIAL_MAX_ATTEMPTS, SERIAL_ATTEMPTS_TTL_SEC, INFLIGHT_LEASE_MS,
        );
    }

    /** Rotina serial esgotou tentativas: finaliza como ERRO e manda para a DLQ final (nunca fica presa em loop). */
    private async finalizeSerialExhausted(
        msg: ConsumeMessage | null,
        data: RotinaJobData,
        attempts: number,
    ): Promise<void> {
        const reason = `Rotina serial esgotou tentativas (${attempts}/${SERIAL_MAX_ATTEMPTS})`;
        console.error(workerLogLine(
            `Job ${data.exeId} (rotina serial=${data.rotinaCodigo}) ${reason} — movendo para ERRO/DLQ.`,
        ));
        try {
            await this.prisma.rOTExecucaoLog.updateMany({
                where: { EXEIdExterno: data.exeId },
                data: { EXEStatus: StatusExecucao.ERRO, EXEFim: new Date(), EXEErro: reason },
            });
        } catch (err) {
            console.error(workerLogLine(`Failed to mark ${data.exeId} as ERRO (serial exhausted):`), err);
        }
        try {
            const content = msg ? msg.content : Buffer.from(JSON.stringify(data));
            const baseHeaders = msg ? msg.properties.headers : undefined;
            this.sendToFinalDlq(content, baseHeaders, data.exeId, reason);
        } catch (err) {
            console.error(workerLogLine(`Failed to send ${data.exeId} to final DLQ (serial exhausted):`), err);
        }
    }

    private startDrainInBackground(instituicaoCodigo: number, rotinaCodigo: number, exeId: string): void {
        this.drainSerialWaitLoop(instituicaoCodigo, rotinaCodigo, exeId).catch((err) => {
            console.error(workerLogLine(`Drain serial loop error (inst=${instituicaoCodigo}, rotina=${rotinaCodigo}):`), err);
        });
    }

    /**
     * Executa um job serial drenado da fila de espera (sem `ConsumeMessage` — não há ack a
     * fazer). Reusa {@link processJob}; falhas são reportadas ao chamador via retorno booleano.
     */
    private async runSerialJob(data: RotinaJobData): Promise<boolean> {
        try {
            await this.clearPendingMarker(data.exeId);
            const result = await this.withHardTimeout(this.processJob(data), `processJob (drain) exeId=${data.exeId}`);
            return result.success;
        } catch (error: any) {
            console.error(workerLogLine(`Job ${data.exeId} error (drain):`), error?.message ?? error);
            return false;
        }
    }

    /**
     * Tenta adquirir o slot de capacidade da instituição em loop, até um teto de tempo
     * (`ROTINA_TENANT_SLOT_WAIT_MS`). Diferente do lock serial (que nunca desiste), aqui um
     * teto é necessário porque a causa da espera é *externa* ao job (capacidade do tenant) —
     * sem teto, um tenant sempre lotado travaria o dreno da fila serial indefinidamente.
     */
    private async acquireTenantSlotBlocking(instituicaoCodigo: number, exeId: string): Promise<boolean> {
        const limit = this.tenantLimits.get(instituicaoCodigo) ?? await this.loadTenantLimit(instituicaoCodigo);
        const deadline = Date.now() + TENANT_SLOT_WAIT_MS;
        let attempts = 0;
        while (!(await this.tryAcquireTenantSlot(instituicaoCodigo, limit, exeId))) {
            attempts++;
            if (Date.now() >= deadline) {
                console.warn(workerLogLine(
                    `Drain serial: exeId=${exeId} desistiu de aguardar slot de capacidade da instituição ${instituicaoCodigo} após ${attempts * 250}ms — devolvendo à cabeça da fila.`,
                ));
                return false;
            }
            if (attempts % 20 === 0) {
                console.warn(workerLogLine(
                    `Drain serial: exeId=${exeId} aguardando slot de capacidade da instituição ${instituicaoCodigo} há ${attempts * 250}ms.`,
                ));
            }
            await sleep(250);
        }
        return true;
    }

    /**
     * Lock distribuído (`SET NX PX`) contra execução dupla do mesmo exeId em instâncias
     * diferentes do worker — complementa o guard de status terminal do Postgres, cobrindo a
     * janela entre "status ainda não é terminal" e "esta instância efetivamente começou a
     * rodar". TTL fixo (não renovado por heartbeat) bound ao teto de tempo do job: como o job
     * nunca roda por mais que isso (ver `withHardTimeout`), não há necessidade de renovação.
     */
    private async acquireRunningLock(exeId: string): Promise<boolean> {
        try {
            const key = redisRunningLockKey(exeId);
            const ok = await this.redis.set(key, this.workerId, 'PX', RUNNING_LOCK_TTL_MS, 'NX');
            return ok === 'OK';
        } catch (err) {
            // Redis indisponível: fail-open (não bloqueia o processamento) — o guard de
            // status terminal no Postgres continua sendo a defesa primária.
            console.error(workerLogLine(`Failed to acquire running lock for ${exeId} (fail-open):`), err);
            return true;
        }
    }

    private async releaseRunningLock(exeId: string): Promise<void> {
        const key = redisRunningLockKey(exeId);
        await this.redis.eval(
            `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`,
            1,
            key,
            this.workerId,
        );
    }

    /**
     * Loop iterativo (não recursivo) de dreno da fila de espera serial. Reconstrói o job a
     * partir do `ROTExecucaoLog` (fonte de verdade durável — não do Redis) e processa um item
     * por vez, encadeando com {@link releaseSerialSlotAndPopNext}/{@link failSerialAttempt}
     * até a lista esvaziar.
     */
    private async drainSerialWaitLoop(
        instituicaoCodigo: number,
        rotinaCodigo: number,
        firstExeId: string,
    ): Promise<void> {
        const { zkey, waitkey, processingkey } = this.serialKeys(instituicaoCodigo, rotinaCodigo);
        let nextExeId: string | null = firstExeId;

        while (nextExeId) {
            const exeId = nextExeId;
            const attemptsKey = redisSerialAttemptsKey(instituicaoCodigo, rotinaCodigo, exeId);

            // Se este exeId já falhou antes (recolocado na cabeça), respeita o backoff antes
            // de tentar de novo — evita martelar um equipamento/serviço que acabou de falhar.
            try {
                const attempts = await getSerialAttempts(this.redis, attemptsKey);
                if (attempts > 0) {
                    const backoff = Math.min(
                        SERIAL_RETRY_BACKOFF_BASE_MS * 2 ** (attempts - 1),
                        SERIAL_RETRY_BACKOFF_CAP_MS,
                    );
                    console.warn(workerLogLine(
                        `Drain serial: exeId=${exeId} tentativa ${attempts + 1}/${SERIAL_MAX_ATTEMPTS} — aguardando ${backoff}ms de backoff.`,
                    ));
                    await sleep(backoff);
                }
            } catch (err) {
                console.error(workerLogLine(`Drain serial: erro lendo tentativas de ${exeId}:`), err);
            }

            let runningLockAcquired = false;
            let jobOutcome: 'success' | 'failure' | 'skipped' | 'requeued-capacity' = 'skipped';
            let failureData: RotinaJobData | null = null;

            try {
                const log = await this.prisma.rOTExecucaoLog.findUnique({ where: { EXEIdExterno: exeId } });
                if (!log) {
                    console.warn(workerLogLine(`Drain serial: exeId=${exeId} sem ROTExecucaoLog — ignorando.`));
                } else if (isTerminalStatus(log.EXEStatus)) {
                    // Guard de idempotência: proteção contra o risco residual de duplicidade
                    // (RPUSH no Redis confirmado + update de status no Postgres falhou).
                    console.warn(workerLogLine(`Drain serial: exeId=${exeId} já terminal (${log.EXEStatus}) — pulando.`));
                } else if (log.ROTCodigo == null) {
                    console.warn(workerLogLine(`Drain serial: exeId=${exeId} sem ROTCodigo — ignorando.`));
                } else {
                    const data: RotinaJobData = {
                        exeId: log.EXEIdExterno,
                        rotinaCodigo: log.ROTCodigo,
                        instituicaoCodigo: log.INSInstituicaoCodigo,
                        trigger: (log.EXETrigger as RotinaJobData['trigger']) ?? 'SCHEDULE',
                        requestEnvelope: {
                            body: log.EXERequestBody,
                            params: log.EXERequestParams,
                            path: log.EXERequestPath,
                        },
                        enqueuedAt: new Date().toISOString(),
                    };

                    runningLockAcquired = await this.acquireRunningLock(exeId);
                    if (!runningLockAcquired) {
                        console.warn(workerLogLine(`Drain serial: exeId=${exeId} já em execução em outra instância — pulando.`));
                    } else {
                        const gotSlot = await this.acquireTenantSlotBlocking(data.instituicaoCodigo, data.exeId);
                        if (!gotSlot) {
                            // Contenção de capacidade do tenant, não falha do job: devolve à
                            // cabeça da fila sem consumir tentativa.
                            jobOutcome = 'requeued-capacity';
                        } else {
                            const serialHeartbeat = new LeaseHeartbeat(this.redis, zkey, exeId, INFLIGHT_LEASE_MS);
                            const tenantHeartbeat = new LeaseHeartbeat(
                                this.redis, redisInflightZkey(data.instituicaoCodigo), exeId, INFLIGHT_LEASE_MS,
                            );
                            serialHeartbeat.start();
                            tenantHeartbeat.start();
                            try {
                                await this.prisma.rOTExecucaoLog.updateMany({
                                    where: { EXEIdExterno: data.exeId },
                                    data: { EXEStatus: StatusExecucao.EM_EXECUCAO },
                                });
                                const success = await this.runSerialJob(data);
                                jobOutcome = success ? 'success' : 'failure';
                                if (!success) failureData = data;
                            } finally {
                                serialHeartbeat.stop();
                                tenantHeartbeat.stop();
                                try {
                                    await this.releaseTenantSlot(data.instituicaoCodigo, data.exeId);
                                } catch (releaseErr) {
                                    console.error(workerLogLine(`Failed to release tenant slot (drain) for ${data.exeId}:`), releaseErr);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(workerLogLine(`Drain serial: erro processando exeId=${exeId}:`), err);
            } finally {
                if (runningLockAcquired) {
                    try {
                        await this.releaseRunningLock(exeId);
                    } catch (releaseErr) {
                        console.error(workerLogLine(`Failed to release running lock (drain) for ${exeId}:`), releaseErr);
                    }
                }
            }

            try {
                if (jobOutcome === 'requeued-capacity') {
                    nextExeId = await requeueAtHeadAndClaimNext(this.redis, zkey, waitkey, processingkey, exeId, INFLIGHT_LEASE_MS);
                } else if (jobOutcome === 'failure' && failureData) {
                    const outcome = await this.failSerialAttempt(instituicaoCodigo, rotinaCodigo, exeId);
                    if (outcome.exhausted) {
                        await this.finalizeSerialExhausted(null, failureData, outcome.attempts);
                    } else {
                        await this.prisma.rOTExecucaoLog.updateMany({
                            where: { EXEIdExterno: exeId },
                            data: { EXEStatus: StatusExecucao.AGUARDANDO_LOCK_SERIAL },
                        }).catch((err) => console.error(workerLogLine(`Failed to mark ${exeId} as AGUARDANDO_LOCK_SERIAL (drain retry):`), err));
                    }
                    nextExeId = outcome.nextExeId;
                } else {
                    // 'success' ou 'skipped' (item inexistente/terminal/sem ROTCodigo/lock
                    // tomado por outra instância) — libera espaço para o próximo sem contar
                    // tentativa.
                    nextExeId = await this.releaseSerialSlotAndPopNext(instituicaoCodigo, rotinaCodigo, exeId);
                }
            } catch (releaseErr) {
                console.error(workerLogLine(`Failed to release+pop serial slot for ${exeId}:`), releaseErr);
                nextExeId = null;
            }
        }
    }

    /**
     * Recupera o estado serial após boot/reconexão e periodicamente (tick de
     * `SERIAL_RECONCILE_INTERVAL_MS`):
     * 1. Lê o índice durável de pares (SET no Redis) — substitui o antigo Set em memória, que
     *    se perdia a cada restart e era a causa raiz do backlog "parar de ser processado".
     * 2. Cura esse índice via SCAN nas chaves wait/processing (cobre perda do próprio SET,
     *    ex.: FLUSHDB acidental, ou um par visto por outra instância que nunca gravou aqui).
     * 3. Para cada par: reclama claims órfãos (`reclaimOrphanSerialClaims`) e, se o lock
     *    estiver livre com itens esperando, promove e dispara o dreno em background.
     */
    private async recoverSerialState(): Promise<void> {
        const pairs = new Set<string>();

        try {
            const known = await this.redis.smembers(redisSerialPairsKey());
            for (const k of known) pairs.add(k);
        } catch (err) {
            console.error(workerLogLine('recoverSerialState: erro lendo índice de pares:'), err);
        }

        try {
            await this.scanForSerialPairs(redisSerialWaitPattern(), redisSerialWaitRegex(), pairs);
            await this.scanForSerialPairs(redisSerialProcessingPattern(), redisSerialProcessingRegex(), pairs);
        } catch (err) {
            console.error(workerLogLine('recoverSerialState: erro no SCAN de pares:'), err);
        }

        for (const pairKey of pairs) {
            const [instStr, rotinaStr] = pairKey.split(':');
            const instituicaoCodigo = Number(instStr);
            const rotinaCodigo = Number(rotinaStr);
            if (!Number.isFinite(instituicaoCodigo) || !Number.isFinite(rotinaCodigo)) continue;

            try {
                await this.redis.sadd(redisSerialPairsKey(), pairKey);
                const { zkey, waitkey, processingkey } = this.serialKeys(instituicaoCodigo, rotinaCodigo);

                const reclaimed = await reclaimOrphanSerialClaims(this.redis, zkey, waitkey, processingkey);
                if (reclaimed.length > 0) {
                    console.warn(workerLogLine(
                        `Recover serial: claim(s) órfão(s) reclamado(s) inst=${instituicaoCodigo} rotina=${rotinaCodigo} exeIds=${reclaimed.join(',')}`,
                    ));
                }

                // Não libera nada de fato (exeId inexistente) — só verifica se o lock está
                // livre/expirado e promove o próximo item da lista, se houver.
                const nextExeId = await this.releaseSerialSlotAndPopNext(
                    instituicaoCodigo,
                    rotinaCodigo,
                    '__serial_reconcile_noop__',
                );
                if (nextExeId) {
                    console.warn(workerLogLine(
                        `Recover serial: lock livre/órfão inst=${instituicaoCodigo} rotina=${rotinaCodigo} — promovendo exeId=${nextExeId}.`,
                    ));
                    this.startDrainInBackground(instituicaoCodigo, rotinaCodigo, nextExeId);
                }

                const [waitLen, processingLen] = await Promise.all([
                    this.redis.llen(waitkey),
                    this.redis.llen(processingkey),
                ]);
                if (waitLen > 0 || processingLen > 0) {
                    console.log(workerLogLine(
                        `Recover serial: backlog inst=${instituicaoCodigo} rotina=${rotinaCodigo} wait=${waitLen} processing=${processingLen}`,
                    ));
                }
            } catch (err) {
                console.error(workerLogLine(`Recover serial: erro no par ${pairKey}:`), err);
            }
        }
    }

    private async scanForSerialPairs(pattern: string, regex: RegExp, out: Set<string>): Promise<void> {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
            cursor = nextCursor;
            for (const key of keys) {
                const m = regex.exec(key);
                if (m) out.add(`${m[1]}:${m[2]}`);
            }
        } while (cursor !== '0');
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

    private sendToFinalDlq(
        content: Buffer,
        baseHeaders: Record<string, unknown> | undefined,
        exeId: string,
        reason: string,
    ): void {
        const pubChannel = this.channel || this.retryChannel;
        if (!pubChannel) return;
        const headers = {
            ...(baseHeaders || {}),
            'x-final-reason': reason,
        };
        const options: Options.Publish = {
            persistent: true,
            headers,
            messageId: exeId,
            correlationId: exeId,
            contentType: 'application/json',
        };
        pubChannel.publish(getJobsDlxExchange(), 'final', content, options);
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
            return sanitizeForIpc(await realDb[model][dbMethod](...args));
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
