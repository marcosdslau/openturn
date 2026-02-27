
import { Controller, Post, Param, ParseIntPipe, Logger, Body, UseGuards } from '@nestjs/common';
import { HardwareService } from '../hardware.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
@Controller('instituicao/:codigoInstituicao/hardware')
export class HardwareController {
    private readonly logger = new Logger(HardwareController.name);

    constructor(private readonly hardwareService: HardwareService) { }

    @Post('sync')
    async syncAll(@Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number) {
        this.logger.log(`[${codigoInstituicao}] Starting full synchronization...`);
        await this.hardwareService.syncAll(codigoInstituicao);
        return { message: 'Synchronization started' };
    }
    @Post(':equipmentId/command')
    async command(
        @Param('codigoInstituicao', ParseIntPipe) codigoInstituicao: number,
        @Param('equipmentId', ParseIntPipe) equipmentId: number,
        @Body() body: { command: string; params?: any; targetIp?: string },
    ) {
        this.logger.log(`[${codigoInstituicao}] Executing command ${body.command} on device ${equipmentId} ${body.targetIp ? `(IP: ${body.targetIp})` : ''}`);
        return await this.hardwareService.executeCommand(equipmentId, body.command, body.params, body.targetIp);
    }
}
