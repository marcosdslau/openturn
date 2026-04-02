import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StatusExecucao } from '@prisma/client';
import * as amqp from 'amqplib';
import type { Options } from 'amqplib';
import Redis from 'ioredis';
import { JOBS_EXCHANGE, getRabbitUrl } from '../../common/rabbit/rabbit-connection';
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

    async getJobCounts() {
        return {
            waiting: 0,
            active: await this.prisma.rOTExecucaoLog.count({
                where: { EXEStatus: StatusExecucao.EM_EXECUCAO },
            }),
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
