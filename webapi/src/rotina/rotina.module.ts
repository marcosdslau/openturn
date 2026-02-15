import { Module } from '@nestjs/common';
import { RotinaController } from './rotina.controller';
import { RotinaService } from './rotina.service';
import { ExecutionService } from './engine/execution.service';
import { ConsoleGateway } from './console.gateway';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
    controllers: [RotinaController],
    providers: [RotinaService, ExecutionService, ConsoleGateway, PrismaService],
    exports: [RotinaService, ExecutionService],
})
export class RotinaModule { }
