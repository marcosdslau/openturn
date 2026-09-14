import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PerfilPreviewDto, PerfilRenomearDto, TurmaSincronizarDto } from './dto/turma.dto';
import { TurmaAcessoService } from './turma-acesso.service';

/**
 * Perfis de horário. Registrado ANTES de TurmaController no módulo para que
 * `turma/perfil` não seja capturado por `turma/:trmCodigo`.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/turma/perfil')
export class TurmaPerfilController {
  constructor(private readonly service: TurmaAcessoService) {}

  @Get()
  @RequirePermission('turma', 'read')
  listar(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.executar(instituicaoCodigo, (core) => core.listarPerfis());
  }

  @Post('preview')
  @RequirePermission('turma', 'read')
  preview(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number, @Body() dto: PerfilPreviewDto) {
    return this.service.executar(instituicaoCodigo, (core) => core.previewPerfil(dto.horarios, dto.TRMCodigo));
  }

  @Put(':phaCodigo')
  @RequirePermission('turma', 'update')
  renomear(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('phaCodigo', ParseIntPipe) phaCodigo: number,
    @Body() dto: PerfilRenomearDto,
    @Req() req: any,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.renomearPerfil(phaCodigo, dto.nome, { usuario: req.user?.userId }),
    );
  }

  @Post(':phaCodigo/sincronizar')
  @RequirePermission('turma', 'sync')
  sincronizar(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('phaCodigo', ParseIntPipe) phaCodigo: number,
    @Body() dto: TurmaSincronizarDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.sincronizar({ PHACodigo: phaCodigo, EQPCodigos: dto.EQPCodigos, forcar: dto.forcar }),
    );
  }
}
