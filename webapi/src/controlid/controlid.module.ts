import { Module } from '@nestjs/common';
import { ControlidMonitorController } from './controlid.controller';
import { ControlidService } from './controlid.service';
import { ControlidSyncService } from './controlid-sync.service';
import { HardwareModule } from '../hardware/hardware.module';

@Module({
    imports: [HardwareModule],
    controllers: [ControlidMonitorController],
    providers: [ControlidService, ControlidSyncService],
    exports: [ControlidService, ControlidSyncService],
})
export class ControlidModule { }
