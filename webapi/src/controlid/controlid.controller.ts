import {
    BadRequestException,
    Controller,
    Get,
    Post,
    Body,
    Query,
    Logger,
    Param,
    ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { ControlidService } from './controlid.service';
import { ControlidSyncService } from './controlid-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HardwareService } from '../hardware/hardware.service';

/**
 * ControlID sob o prefixo instituicao/:codigoInstituicao/monitor/controlid/*
 */
@Controller('instituicao/:codigoInstituicao/monitor/controlid')
export class ControlidMonitorController {
    private readonly logger = new Logger(ControlidMonitorController.name);

    constructor(
        private readonly controlidService: ControlidService,
        private readonly syncService: ControlidSyncService,
        private readonly hardwareService: HardwareService,
    ) { }

    private async deviceInstituicaoConfere(
        deviceId: unknown,
        codigoInstituicao: number,
    ): Promise<boolean> {
        const instEquip = await this.hardwareService.resolveInstituicaoCodigoFromControlidDeviceId(
            deviceId,
        );
        return instEquip !== null && instEquip === codigoInstituicao;
    }

    // ─── Push: equipamento consulta comandos pendentes ──────────────
    @Get('push')
    async getPush(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Query('deviceId') deviceId: string,
    ) {
        if (!(await this.deviceInstituicaoConfere(deviceId, codigoInstituicao))) {
            this.logger.warn(
                `[${codigoInstituicao}] [ControlID] push: deviceId=${deviceId} inexistente ou instituição divergente; retornando vazio`,
            );
            return {};
        }
        this.logger.log(`[${codigoInstituicao}] [ControlID] Push query from device: ${deviceId}`);
        return this.controlidService.getPendingCommand(Number(deviceId));
    }

    // ─── Result: equipamento envia resultado do comando ────────────
    @Post('result')
    async postResult(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
        @Query('deviceId') deviceId: string,
    ) {
        if (!(await this.deviceInstituicaoConfere(deviceId, codigoInstituicao))) {
            this.logger.warn(
                `[${codigoInstituicao}] [ControlID] result: deviceId=${deviceId} inexistente ou instituição divergente; ignorando`,
            );
            return {};
        }
        this.logger.log(`[${codigoInstituicao}] [ControlID] Result from device ${deviceId}`);
        await this.controlidService.processResult(Number(deviceId), body);
        return {};
    }

    // ─── Online: identificação em tempo real (Modo Pro) ────────────
    @Post('new_user_identified.fcgi')
    async newUserIdentified(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        if (!(await this.deviceInstituicaoConfere(body?.device_id, codigoInstituicao))) {
            this.logger.warn(
                `[${codigoInstituicao}] [ControlID] Online: device_id=${body?.device_id} inexistente ou instituição divergente`,
            );
            return {
                result: {
                    event: 6,
                    user_id: body?.user_id,
                    user_name: 'Desconhecido',
                    user_image: false,
                    actions: [],
                    message: 'Equipamento não pertence a esta instituição',
                },
            };
        }
        this.logger.log(
            `[${codigoInstituicao}] [ControlID] Online: user_id=${body.user_id} device_id=${body.device_id}`,
        );
        return this.controlidService.validarAcessoOnline(body);
    }

    // ─── Sync: API interna protegida para disparar sincronização ───
    @UseGuards(JwtAuthGuard)
    @Post('sync')
    async syncPessoas(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body('equipamentoCodigo', ParseIntPipe) equipamentoCodigo: number,
        @Body('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        if (instituicaoCodigo !== codigoInstituicao) {
            throw new BadRequestException(
                'instituicaoCodigo do corpo não confere com codigoInstituicao da URL',
            );
        }
        return this.syncService.syncPessoasToEquipamento(equipamentoCodigo, instituicaoCodigo);
    }

    @Post('catra_event')
    async catraEvent(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        const instEquip = await this.hardwareService.resolveInstituicaoCodigoFromControlidDeviceId(
            body?.device_id,
        );
        if (instEquip == null) {
            this.logger.warn(
                `[${codigoInstituicao}] [ControlID] catra_event: equipamento device_id=${body?.device_id} não encontrado; ignorando`,
            );
            return {};
        }
        if (instEquip !== codigoInstituicao) {
            this.logger.warn(
                `[${codigoInstituicao}] [ControlID] catra_event: device_id=${body?.device_id} pertence à instituição ${instEquip}, não ${codigoInstituicao}; ignorando`,
            );
            return {};
        }
        this.logger.log(
            `[${codigoInstituicao}] [ControlID] Catra Event received: device=${body?.device_id} user=${body?.user_id}`,
        );
        await this.hardwareService.persistControlidCatraEvent(codigoInstituicao, body);
        await this.controlidService.registrarPassagem(body);
        return {};
    }

    @Post('door')
    doorEvent(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Door Event: device=${body?.device_id}`);
        return {};
    }

    @Post('operation_mode')
    operationMode(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Operation Mode Event received`);
        return {};
    }

    @Post('template')
    template(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Template Event received`);
        return {};
    }

    @Post('face_template')
    faceTemplate(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Face Template Event received`);
        return {};
    }

    @Post('card')
    card(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] Card Event received`);
        return {};
    }

    @Post('user_image')
    userImage(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        this.logger.log(`[${codigoInstituicao}] [ControlID] User Image Event received`);
        return {};
    }

    @Post('dao')
    async daoNotification(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Body() body: any,
    ) {
        const instEquip = await this.hardwareService.resolveInstituicaoCodigoFromControlidDeviceId(
            body?.device_id,
        );
        if (instEquip == null) {
            this.logger.warn(
                `[${codigoInstituicao}] [ControlID] DAO: equipamento device_id=${body?.device_id} não encontrado; ignorando`,
            );
            return {};
        }
        if (instEquip !== codigoInstituicao) {
            this.logger.warn(
                `[${codigoInstituicao}] [ControlID] DAO: device_id=${body?.device_id} pertence à instituição ${instEquip}, não ${codigoInstituicao}; ignorando`,
            );
            return {};
        }
        this.logger.log(`[${codigoInstituicao}] [ControlID] DAO Notification received`);
        await this.hardwareService.persistControlidDao(codigoInstituicao, body);
        return {};
    }
}
