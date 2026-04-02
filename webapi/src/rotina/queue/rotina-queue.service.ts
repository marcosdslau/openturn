import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, StatusExecucao } from '@prisma/client';
import * as amqp from 'amqplib';
import type { Options } from 'amqplib';
import Redis from 'ioredis';
import { JOBS_EXCHANGE, getRabbitUrl, getMainQueueName, GLOBAL_RETRY_QUEUE, JOBS_DLX_QUEUE } from '../../common/rabbit/rabbit-connection';

const ROTINA_RETRY_HEADER = 'x-rotina-retry-count';

export interface ReprocessDeadLetterResult {
    republished: number;
    skippedInvalid: number;
    errors: string[];
}
import { getRedisConnectionOptions } from '../../common/redis/redis-connection';
import { RotinaJobData } from './rotina-job.dto';

@Injectable()
export class RotinaQueueService {
    private readonly logger = new Logger(RotinaQueueService.name);
    private connectionPromise: Promise<amqp.ChannelModel> | null = null;
    private channelPromise: Promise<amqp.Channel> | null = null;
    private redis: Redis | null = null;

    constructor(
        private readonly prisma: PrismaService,
    ) {
        try {
            const client = new Redis({ ...getRedisConnectionOptions(), lazyConnect: true });
            this.redis = client;
            client.connect().catch(() => {
                this.logger.warn('Redis indisponível: marcador rotina:pending desligado');
                void client.quit();
                this.redis = null;
            });
        } catch {
            this.redis = null;
        }
    }

    async enqueue(
        rotinaCodigo: number,
        instituicaoCodigo: number,
        trigger: 'SCHEDULE' | 'WEBHOOK',
        requestData?: any,
    ): Promise<{ exeId: string; jobId: string }> {
        const execLog = await this.prisma.rOTExecucaoLog.create({
            data: {
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
                EXEStatus: StatusExecucao.EM_EXECUCAO,
                EXEInicio: new Date(),
                EXETrigger: trigger,
                EXERequestBody: requestData?.body,
                EXERequestParams: requestData?.params,
                EXERequestPath: requestData?.path,
            },
        });

        const exeId = execLog.EXEIdExterno;

        const jobData: RotinaJobData = {
            exeId,
            rotinaCodigo,
            instituicaoCodigo,
            trigger,
            requestEnvelope: requestData,
            enqueuedAt: new Date().toISOString(),
        };

        await this.publishJob(jobData, exeId);
        void this.setPendingMarker(exeId).catch((e) =>
            this.logger.debug(`rotina:pending não gravado (${exeId}): ${(e as Error)?.message ?? e}`),
        );

        this.logger.log(`Job enqueued: ${exeId} (rotina=${rotinaCodigo}, trigger=${trigger})`);

        return { exeId, jobId: exeId };
    }

    private pendingKey(exeId: string) {
        return `rotina:pending:${exeId}`;
    }

    /** Marcador opcional (UX): worker remove ao consumir. TTL evita chave órfã se o Redis da API reiniciar. */
    private async setPendingMarker(exeId: string): Promise<void> {
        if (!this.redis) return;
        const ttl = Math.max(60, parseInt(process.env.ROTINA_PENDING_TTL_SEC || '86400', 10));
        await this.redis.setex(this.pendingKey(exeId), ttl, '1');
    }

    async clearPendingMarker(exeId: string): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.del(this.pendingKey(exeId));
        } catch (e) {
            this.logger.debug(`rotina:pending não removido (${exeId}): ${(e as Error)?.message ?? e}`);
        }
    }

    async cancelJob(exeId: string): Promise<boolean> {
        const result = await this.prisma.rOTExecucaoLog.updateMany({
            where: {
                EXEIdExterno: exeId,
                EXEStatus: StatusExecucao.EM_EXECUCAO,
            },
            data: {
                EXEStatus: StatusExecucao.CANCELADO,
                EXEFim: new Date(),
                EXEErro: 'Cancelado antes de concluir execução',
            },
        });
        if (result.count > 0) {
            await this.clearPendingMarker(exeId);
        }
        return result.count > 0;
    }

    async sendCancelSignal(exeId: string): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.publish('rotina:cancel', JSON.stringify({ exeId }));
        } catch (e) {
            this.logger.debug(`Erro ao publicar sinal de cancelamento (${exeId}): ${(e as Error)?.message ?? e}`);
        }
    }

    /**
     * Esvazia `q.rotina.dlq`: republica cada payload na fila da instituição (exchange jobs + routing key)
     * com contador de retry zerado. Marca o ROTExecucaoLog como EM_EXECUCAO para nova tentativa;
     * o worker atualiza status/resultado ao concluir.
     */
    async reprocessDeadLetterQueue(): Promise<ReprocessDeadLetterResult> {
        const MAX_MESSAGES = Math.max(1, parseInt(process.env.ROTINA_DLQ_REPROCESS_MAX || '5000', 10));
        const channel = await this.getChannel();
        await channel.assertQueue(JOBS_DLX_QUEUE, { durable: true });

        let republished = 0;
        let skippedInvalid = 0;
        const errors: string[] = [];

        for (let n = 0; n < MAX_MESSAGES; n++) {
            const msg = await channel.get(JOBS_DLX_QUEUE, { noAck: false });
            if (!msg) break;

            let data: RotinaJobData;
            try {
                data = JSON.parse(msg.content.toString()) as RotinaJobData;
            } catch {
                skippedInvalid += 1;
                errors.push('Mensagem com JSON inválido (removida da DLQ)');
                channel.ack(msg);
                continue;
            }

            if (
                !data.exeId ||
                typeof data.instituicaoCodigo !== 'number' ||
                typeof data.rotinaCodigo !== 'number' ||
                (data.trigger !== 'SCHEDULE' && data.trigger !== 'WEBHOOK')
            ) {
                skippedInvalid += 1;
                errors.push(`Payload inválido (exeId=${String(data?.exeId)}), mensagem removida da DLQ`);
                channel.ack(msg);
                continue;
            }

            await this.prisma.rOTExecucaoLog.updateMany({
                where: { EXEIdExterno: data.exeId },
                data: {
                    EXEStatus: StatusExecucao.EM_EXECUCAO,
                    EXEInicio: new Date(),
                    EXEFim: null,
                    EXEDuracaoMs: null,
                    EXEErro: null,
                    EXEResultado: Prisma.JsonNull,
                    EXELogs: Prisma.JsonNull,
                },
            });

            const rawHeaders = (msg.properties.headers || {}) as Record<string, unknown>;
            const headers: Record<string, unknown> = { ...rawHeaders };
            headers[ROTINA_RETRY_HEADER] = 0;
            delete headers['x-final-reason'];

            const properties: Options.Publish = {
                persistent: true,
                headers: headers as Options.Publish['headers'],
                messageId: data.exeId,
                correlationId: (msg.properties.correlationId as string) || data.exeId,
                contentType: msg.properties.contentType || 'application/json',
                timestamp: Date.now(),
            };

            const ok = channel.publish(
                JOBS_EXCHANGE,
                String(data.instituicaoCodigo),
                msg.content,
                properties,
            );
            if (!ok) {
                errors.push(`Buffer do canal cheio ao republicar ${data.exeId}; mensagem recolocada na DLQ`);
                channel.nack(msg, false, true);
                continue;
            }

            channel.ack(msg);
            republished += 1;
            void this.setPendingMarker(data.exeId).catch(() => { });
        }

        if (republished > 0) {
            this.logger.log(`DLQ reprocess: ${republished} mensagem(ns) republicada(s)`);
        }
        return { republished, skippedInvalid, errors };
    }

    async getJobCounts() {
        const institutions = await this.prisma.iNSInstituicao.findMany({
            where: { INSAtivo: true },
            select: { INSCodigo: true },
        });

        let waitingCount = 0;
        const conn = await this.getConnection();
        let checkChannel = await conn.createChannel();

        try {
            for (const inst of institutions) {
                try {
                    const qName = getMainQueueName(inst.INSCodigo);
                    const qInfo = await checkChannel.checkQueue(qName);
                    waitingCount += qInfo.messageCount;
                } catch (e) {
                    try { await checkChannel.close(); } catch { }
                    checkChannel = await conn.createChannel();
                }
            }

            // Adiciona filas globais
            for (const qName of [GLOBAL_RETRY_QUEUE, JOBS_DLX_QUEUE]) {
                try {
                    const qInfo = await checkChannel.checkQueue(qName);
                    waitingCount += qInfo.messageCount;
                } catch (e) {
                    try { await checkChannel.close(); } catch { }
                    checkChannel = await conn.createChannel();
                }
            }
        } finally {
            try { await checkChannel.close(); } catch { }
        }

        // Contagem de jobs realmente ativos nos workers via Redis Semaphores
        let redisActiveCount = 0;
        if (this.redis) {
            try {
                const keys = await this.redis.keys('rotina:inflight:z:*');
                const now = Date.now();
                for (const key of keys) {
                    // Limpa leases expirados para precisão no monitor
                    await this.redis.zremrangebyscore(key, '-inf', now);
                    const card = await this.redis.zcard(key);
                    redisActiveCount += card;
                }
            } catch (e) {
                this.logger.debug('Erro ao contar jobs ativos no Redis:', e);
            }
        }

        return {
            waiting: waitingCount,
            active: redisActiveCount,
            completed: await this.prisma.rOTExecucaoLog.count({
                where: { EXEStatus: StatusExecucao.SUCESSO },
            }),
            failed: await this.prisma.rOTExecucaoLog.count({
                where: { EXEStatus: StatusExecucao.ERRO },
            }),
            delayed: 0,
            paused: 0,
            prioritized: 0,
        };
    }

    private async publishJob(data: RotinaJobData, exeId: string) {
        const channel = await this.getChannel();
        const properties: Options.Publish = {
            persistent: true,
            messageId: exeId,
            correlationId: exeId,
            contentType: 'application/json',
            timestamp: Date.now(),
            headers: {
                'x-rotina-retry-count': 0,
            },
        };

        const payload = Buffer.from(JSON.stringify(data));
        channel.publish(JOBS_EXCHANGE, String(data.instituicaoCodigo), payload, properties);
    }

    private async getChannel(): Promise<amqp.Channel> {
        if (!this.channelPromise) {
            this.channelPromise = this.getConnection().then(async (connection) => {
                const channel = await connection.createChannel();
                await channel.assertExchange(JOBS_EXCHANGE, 'direct', { durable: true });
                return channel;
            });
        }
        return this.channelPromise;
    }

    private async getConnection(): Promise<amqp.ChannelModel> {
        if (!this.connectionPromise) {
            this.connectionPromise = amqp.connect(getRabbitUrl());
        }
        return this.connectionPromise;
    }
}
