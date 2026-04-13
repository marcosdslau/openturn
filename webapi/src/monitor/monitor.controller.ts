import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { MonitorService } from './monitor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';
import { RabbitManagementService } from '../common/rabbit/rabbit-management.service';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';

@Controller('monitor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MonitorController {
    constructor(
        private readonly monitorService: MonitorService,
        private readonly rabbitMgmtService: RabbitManagementService,
        private readonly rotinaQueueService: RotinaQueueService,
    ) { }

    @Get('stats')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    async getStats() {
        return this.monitorService.getGlobalStats();
    }

    @Get('rabbit-overview')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    async getRabbitOverview() {
        return this.rabbitMgmtService.getOverview();
    }

    @Post('rabbit/reprocess-dlq')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    async reprocessDeadLetter() {
        return this.rotinaQueueService.reprocessDeadLetterQueue();
    }

    @Post('refresh')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    async refreshSnapshot() {
        return this.monitorService.forceRefreshSnapshot();
    }
}
