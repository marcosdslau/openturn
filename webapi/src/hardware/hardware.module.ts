
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ConnectorModule } from '../connector/connector.module';
import { HardwareService } from './hardware.service';
import { HardwareController } from './controllers/hardware.controller';
import { ControlIDController } from './controllers/controlid.controller';

@Module({
    imports: [AuthModule, PrismaModule, ConnectorModule],
    controllers: [ControlIDController, HardwareController],
    providers: [HardwareService],
    exports: [HardwareService],
})
export class HardwareModule { }
