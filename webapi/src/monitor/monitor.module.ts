import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { MonitorController } from './monitor.controller';
import { RotinaModule } from '../rotina/rotina.module';
import { PrismaService } from '../common/prisma/prisma.service';

@Module({
    imports: [RotinaModule],
    controllers: [MonitorController],
    providers: [MonitorService, PrismaService],
})
export class MonitorModule { }
