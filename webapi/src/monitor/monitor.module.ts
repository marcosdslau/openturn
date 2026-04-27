import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonitorService } from './monitor.service';
import { MonitorController } from './monitor.controller';
import { RotinaModule } from '../rotina/rotina.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { MonitorSnapshotBuilder } from './monitor-snapshot.builder';
import { MonitorSnapshotService } from './monitor-snapshot.service';
import { MonitorSnapshotCronService } from './monitor-snapshot.cron';
import { RabbitManagementService } from '../common/rabbit/rabbit-management.service';
import { MonitorInstituicaoController } from './monitor-instituicao.controller';
import { MonitorInstituicaoDashboardService } from './monitor-instituicao-dashboard.service';

@Module({
  imports: [AuthModule, RotinaModule],
  controllers: [MonitorController, MonitorInstituicaoController],
  providers: [
    PrismaService,
    MonitorSnapshotBuilder,
    MonitorSnapshotService,
    MonitorSnapshotCronService,
    RabbitManagementService,
    MonitorService,
    MonitorInstituicaoDashboardService,
  ],
})
export class MonitorModule {}
