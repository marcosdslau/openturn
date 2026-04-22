
import { Controller, Post, Param, ParseIntPipe, Logger, Body, UseGuards } from '@nestjs/common';
import { HardwareService } from '../hardware.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/hardware')
export class HardwareController {
    private readonly logger = new Logger(HardwareController.name);

    constructor(private readonly hardwareService: HardwareService) { }

    @Post('sync')
    @RequirePermission('equipamento', 'update')
    async syncAll(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
        this.logger.log(`[${instituicaoCodigo}] Starting full synchronization...`);
        await this.hardwareService.syncAll(instituicaoCodigo);
        return { message: 'Synchronization started' };
    }

    @Post(':equipmentId/command')
    @RequirePermission('equipamento', 'update')
    async command(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('equipmentId', ParseIntPipe) equipmentId: number,
        @Body() body: { command: string; params?: any; targetIp?: string },
    ) {
        this.logger.log(`[${instituicaoCodigo}] Executing command ${body.command} on device ${equipmentId} ${body.targetIp ? `(IP: ${body.targetIp})` : ''}`);
        return await this.hardwareService.executeCommand(equipmentId, body.command, body.params, body.targetIp);
    }
}
