import { Module } from '@nestjs/common';
import { ControlidController } from './controlid.controller';
import { ControlidService } from './controlid.service';
import { ControlidSyncService } from './controlid-sync.service';

@Module({
    controllers: [ControlidController],
    providers: [ControlidService, ControlidSyncService],
    exports: [ControlidService, ControlidSyncService],
})
export class ControlidModule { }
