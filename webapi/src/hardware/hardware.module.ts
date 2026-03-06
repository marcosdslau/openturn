
import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ConnectorModule } from '../connector/connector.module';
import { HardwareService } from './hardware.service';
import { HardwareController } from './controllers/hardware.controller';
import { ControlIDController } from './controllers/controlid.controller';
import { MonitorController } from './monitor/monitor.controller';

@Module({
    imports: [PrismaModule, ConnectorModule],
    controllers: [ControlIDController, HardwareController, MonitorController],
    providers: [HardwareService],
    exports: [HardwareService],
})
export class HardwareModule { }
