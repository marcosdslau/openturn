import { Controller, Get, UseGuards } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@Controller('monitor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MonitorController {
    constructor(private readonly monitorService: MonitorService) { }

    @Get('stats')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    async getStats() {
        return this.monitorService.getGlobalStats();
    }
}
