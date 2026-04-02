import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StatusExecucao } from '@prisma/client';
import * as amqp from 'amqplib';
import type { Options } from 'amqplib';
import { JOBS_EXCHANGE, getRabbitUrl } from '../../common/rabbit/rabbit-connection';
import { RotinaJobData } from './rotina-job.dto';

@Injectable()
export class RotinaQueueService {
    private readonly logger = new Logger(RotinaQueueService.name);
    private connectionPromise: Promise<amqp.ChannelModel> | null = null;
    private channelPromise: Promise<amqp.Channel> | null = null;

    constructor(
        private readonly prisma: PrismaService,
    ) { }

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

        this.logger.log(`Job enqueued: ${exeId} (rotina=${rotinaCodigo}, trigger=${trigger})`);

        return { exeId, jobId: exeId };
    }

    /** Estado ativo depende do log de execução no banco. */
    async hasLiveJob(exeId: string): Promise<boolean> {
        const exec = await this.prisma.rOTExecucaoLog.findFirst({
            where: { EXEIdExterno: exeId },
            select: { EXEStatus: true },
        });
        return exec?.EXEStatus === StatusExecucao.EM_EXECUCAO;
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
        return result.count > 0;
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
