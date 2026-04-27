import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ConnectorModule } from '../connector/connector.module';
import { HardwareService } from './hardware.service';
import { HardwareController } from './controllers/hardware.controller';
import { HardwareFactory } from './factory/hardware.factory';
import { ControlIdBrandFactory } from './brands/controlid/controlid.factory';
import { HikvisionBrandFactory } from './brands/hikvision/hikvision.factory';
import { IntelbrasBrandFactory } from './brands/intelbras/intelbras.factory';
import { TopdataBrandFactory } from './brands/topdata/topdata.factory';
import { ControlidMonitorController } from './brands/controlid/controllers/controlid-monitor.controller';
import { ControlidResolverService } from './brands/controlid/services/controlid-resolver.service';
import { ControlidMonitorService } from './brands/controlid/services/controlid-monitor.service';
import { ControlidCommandQueueService } from './brands/controlid/services/controlid-command-queue.service';
import { ControlidPassagemService } from './brands/controlid/services/controlid-passagem.service';
import { ControlidSyncService } from './brands/controlid/services/controlid-sync.service';

@Module({
  imports: [AuthModule, PrismaModule, ConnectorModule],
  controllers: [HardwareController, ControlidMonitorController],
  providers: [
    HardwareService,
    HardwareFactory,
    ControlIdBrandFactory,
    HikvisionBrandFactory,
    IntelbrasBrandFactory,
    TopdataBrandFactory,
    ControlidResolverService,
    ControlidMonitorService,
    ControlidCommandQueueService,
    ControlidPassagemService,
    ControlidSyncService,
  ],
  exports: [HardwareService],
})
export class HardwareModule {}
