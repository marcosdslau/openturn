import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RotinaController } from './rotina.controller';
import { RotinaWebhookController } from './rotina-webhook.controller';
import { RotinaService } from './rotina.service';
import { SchedulerService } from './scheduler.service';
import { ExecutionService } from './engine/execution.service';
import { ProcessManager } from './engine/process-manager';
import { ConsoleGateway } from './console.gateway';
import { PrismaService } from '../common/prisma/prisma.service';
import { LogCleanupService } from './log-cleanup.service';
import { RotinaQueueService } from './queue/rotina-queue.service';
import { ROTINA_QUEUE_NAME } from './queue/rotina-job.dto';

@Module({
    imports: [
        BullModule.registerQueue({ name: ROTINA_QUEUE_NAME }),
    ],
    controllers: [RotinaController, RotinaWebhookController],
    providers: [
        RotinaService,
        SchedulerService,
        ExecutionService,
        ProcessManager,
        ConsoleGateway,
        PrismaService,
        LogCleanupService,
        RotinaQueueService,
    ],
    exports: [RotinaService, ExecutionService, ProcessManager, RotinaQueueService],
})
export class RotinaModule { }
