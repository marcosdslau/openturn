import { Module } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { MonitorController } from './monitor.controller';
import { RotinaModule } from '../rotina/rotina.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { MonitorSnapshotBuilder } from './monitor-snapshot.builder';
import { MonitorSnapshotService } from './monitor-snapshot.service';
import { MonitorSnapshotCronService } from './monitor-snapshot.cron';

@Module({
    imports: [RotinaModule],
    controllers: [MonitorController],
    providers: [
        PrismaService,
        MonitorSnapshotBuilder,
        MonitorSnapshotService,
        MonitorSnapshotCronService,
        MonitorService,
    ],
})
export class MonitorModule { }
