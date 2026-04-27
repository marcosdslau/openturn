import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RotinaController } from './rotina.controller';
import { RotinaExecutionController } from './rotina-execution.controller';
import { RotinaWebhookController } from './rotina-webhook.controller';
import { RotinaService } from './rotina.service';
import { RotinaExecutionService } from './rotina-execution.service';
import { SchedulerService } from './scheduler.service';
import { ExecutionService } from './engine/execution.service';
import { ProcessManager } from './engine/process-manager';
import { ConsoleGateway } from './console.gateway';
import { PrismaService } from '../common/prisma/prisma.service';
import { LogCleanupService } from './log-cleanup.service';
import { RotinaQueueService } from './queue/rotina-queue.service';

@Module({
  imports: [AuthModule],
  controllers: [
    RotinaController,
    RotinaExecutionController,
    RotinaWebhookController,
  ],
  providers: [
    RotinaService,
    RotinaExecutionService,
    SchedulerService,
    ExecutionService,
    ProcessManager,
    ConsoleGateway,
    PrismaService,
    LogCleanupService,
    RotinaQueueService,
  ],
  exports: [
    RotinaService,
    ExecutionService,
    ProcessManager,
    RotinaQueueService,
  ],
})
export class RotinaModule {}
