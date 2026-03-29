import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StatusExecucao } from '@prisma/client';
import { ROTINA_QUEUE_NAME, RotinaJobData } from './rotina-job.dto';

@Injectable()
export class RotinaQueueService {
    private readonly logger = new Logger(RotinaQueueService.name);

    constructor(
        @InjectQueue(ROTINA_QUEUE_NAME) private readonly rotinaQueue: Queue<RotinaJobData>,
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

        const job = await this.rotinaQueue.add(trigger, jobData, {
            jobId: exeId,
            removeOnComplete: 100,
            removeOnFail: 200,
        });

        this.logger.log(`Job enqueued: ${job.id} (rotina=${rotinaCodigo}, trigger=${trigger})`);

        return { exeId, jobId: job.id! };
    }

    async waitForResult(exeId: string, timeoutMs: number = 120_000): Promise<any> {
        const queueEvents = this.rotinaQueue.toKey('');
        const job = await this.rotinaQueue.getJob(exeId);
        if (!job) {
            throw new Error(`Job ${exeId} não encontrado na fila`);
        }
        return job.waitUntilFinished(
            (await import('bullmq')).QueueEvents.prototype as any,
            timeoutMs,
        );
    }

    /** Job ainda na fila ou sendo processado (não concluído / falho / removido). */
    async hasLiveJob(exeId: string): Promise<boolean> {
        const job = await this.rotinaQueue.getJob(exeId);
        if (!job) return false;
        const state = await job.getState();
        const liveStates = [
            'waiting',
            'delayed',
            'active',
            'paused',
            'waiting-children',
            'prioritized',
        ];
        return liveStates.includes(state);
    }

    async cancelJob(exeId: string): Promise<boolean> {
        const job = await this.rotinaQueue.getJob(exeId);
        if (!job) return false;

        const state = await job.getState();
        if (state === 'waiting' || state === 'delayed') {
            await job.remove();
            await this.prisma.rOTExecucaoLog.updateMany({
                where: { EXEIdExterno: exeId },
                data: {
                    EXEStatus: StatusExecucao.CANCELADO,
                    EXEFim: new Date(),
                    EXEErro: 'Cancelado antes de iniciar execução',
                },
            });
            return true;
        }

        return false;
    }

    async getJobCounts() {
        return this.rotinaQueue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
            'paused',
            'prioritized',
        );
    }
}
