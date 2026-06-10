import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { VisitanteService } from './visitante.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/visitante')
export class VisitanteController {
  constructor(private readonly visitanteService: VisitanteService) {}

  @Get('equipamentos')
  @RequirePermission('visitante', 'read')
  listEquipamentos(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
  ) {
    return this.visitanteService.listEquipamentosAtivos(instituicaoCodigo);
  }
}
