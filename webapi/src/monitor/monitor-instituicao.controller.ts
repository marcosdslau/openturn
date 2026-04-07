import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MonitorInstituicaoDashboardService } from './monitor-instituicao-dashboard.service';

@Controller('instituicao/:instituicaoCodigo/monitor')
@UseGuards(JwtAuthGuard)
export class MonitorInstituicaoController {
    constructor(private readonly instituicaoDashboard: MonitorInstituicaoDashboardService) {}

    @Get('dashboard')
    async getDashboard(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
        return this.instituicaoDashboard.getDashboard(instituicaoCodigo);
    }
}
