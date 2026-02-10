import { Controller, Get, Post, Body, Query, Logger, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ControlidService } from './controlid.service';
import { ControlidSyncService } from './controlid-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class ControlidController {
    private readonly logger = new Logger(ControlidController.name);

    constructor(
        private readonly controlidService: ControlidService,
        private readonly syncService: ControlidSyncService,
    ) { }

    // ─── Push: equipamento consulta comandos pendentes ──────────────
    @Get('controlid/push')
    async getPush(@Query('deviceId') deviceId: string) {
        this.logger.log(`Push query from device: ${deviceId}`);
        return this.controlidService.getPendingCommand(Number(deviceId));
    }

    // ─── Result: equipamento envia resultado do comando ────────────
    @Post('controlid/result')
    async postResult(@Body() body: any, @Query('deviceId') deviceId: string) {
        this.logger.log(`Result from device ${deviceId}`);
        await this.controlidService.processResult(Number(deviceId), body);
        return {};
    }

    // ─── Monitor: evento de giro de catraca (iDBlock) ──────────────
    @Post('controlid/api/notifications/catra_event')
    async catraEvent(@Body() body: any) {
        this.logger.log(`Catra Event: device=${body.device_id} user=${body.user_id}`);
        await this.controlidService.registrarPassagem(body);
        return {};
    }

    // ─── Monitor: evento de porta ──────────────────────────────────
    @Post('controlid/api/notifications/door')
    doorEvent(@Body() body: any) {
        this.logger.log(`Door Event: device=${body.device_id}`);
        return {};
    }

    // ─── Monitor: notificação DAO (logs, templates, cards) ─────────
    @Post('controlid/api/notifications/dao')
    daoNotification(@Body() body: any) {
        this.logger.log(`DAO Notification: ${JSON.stringify(body?.object_changes?.[0]?.object || 'unknown')}`);
        return {};
    }

    // ─── Online: identificação em tempo real (Modo Pro) ────────────
    @Post('controlid/new_user_identified.fcgi')
    async newUserIdentified(@Body() body: any) {
        this.logger.log(`Online: user_id=${body.user_id} device_id=${body.device_id}`);
        return this.controlidService.validarAcessoOnline(body);
    }

    // ─── Sync: API interna protegida para disparar sincronização ───
    @UseGuards(JwtAuthGuard)
    @Post('controlid/sync')
    async syncPessoas(
        @Body('equipamentoCodigo', ParseIntPipe) equipamentoCodigo: number,
        @Body('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        return this.syncService.syncPessoasToEquipamento(equipamentoCodigo, instituicaoCodigo);
    }
}
