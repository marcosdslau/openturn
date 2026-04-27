import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { MonitorInstituicaoDashboardService } from './monitor-instituicao-dashboard.service';

@Controller('instituicao/:instituicaoCodigo/monitor')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MonitorInstituicaoController {
  constructor(
    private readonly instituicaoDashboard: MonitorInstituicaoDashboardService,
  ) {}

  @Get('dashboard')
  @RequirePermission('dashboard', 'read')
  async getDashboard(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
  ) {
    return this.instituicaoDashboard.getDashboard(instituicaoCodigo);
  }
}
