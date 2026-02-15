import { Module } from '@nestjs/common';
import { RotinaController } from './rotina.controller';
import { RotinaWebhookController } from './rotina-webhook.controller';
import { RotinaService } from './rotina.service';
import { SchedulerService } from './scheduler.service';
import { ExecutionService } from './engine/execution.service';
import { ConsoleGateway } from './console.gateway';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
    controllers: [RotinaController, RotinaWebhookController],
    providers: [RotinaService, SchedulerService, ExecutionService, ConsoleGateway, PrismaService],
    exports: [RotinaService, ExecutionService],
})
export class RotinaModule { }
