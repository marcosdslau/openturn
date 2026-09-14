import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import {
  ImportacaoAnoAnteriorDto,
  TurmaFiltroDto,
  TurmaSincronizarDto,
  TurmaValidacaoDto,
  TurmaValidacaoLoteDto,
} from './dto/turma.dto';
import { TurmaAcessoService } from './turma-acesso.service';

/** Controle de acesso por turma — spec em working/Controle-turma/README.md. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/turma')
export class TurmaController {
  constructor(private readonly service: TurmaAcessoService) {}

  @Get()
  @RequirePermission('turma', 'read')
  listar(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number, @Query() filtro: TurmaFiltroDto) {
    const ativa = filtro.ativa === 'todas' ? 'todas' : filtro.ativa === 'false' ? false : true;
    return this.service.executar(instituicaoCodigo, (core) => core.listar({ ...filtro, ativa }));
  }

  @Get('opcoes-filtro')
  @RequirePermission('turma', 'read')
  opcoesFiltro(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.executar(instituicaoCodigo, (core) => core.opcoesFiltro());
  }

  @Get('importacao-ano-anterior')
  @RequirePermission('turma', 'read')
  sugestoesImportacao(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.executar(instituicaoCodigo, (core) => core.sugestoesImportacaoAnoAnterior());
  }

  @Post('importacao-ano-anterior')
  @RequirePermission('turma', 'update')
  importarAnoAnterior(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: ImportacaoAnoAnteriorDto,
    @Req() req: any,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.importarAnoAnterior(dto.pares, { usuario: req.user?.userId }),
    );
  }

  @Put('validacao/lote')
  @RequirePermission('turma', 'update')
  salvarEmLote(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: TurmaValidacaoLoteDto,
    @Req() req: any,
  ) {
    const { TRMCodigos, ...entrada } = dto;
    return this.service.executar(instituicaoCodigo, (core) =>
      core.salvarValidacaoEmLote(TRMCodigos, entrada, { usuario: req.user?.userId }),
    );
  }

  @Post('reconciliar')
  @RequirePermission('turma', 'sync')
  reconciliar(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
    return this.service.executar(instituicaoCodigo, (core) => core.reconciliar());
  }

  @Get(':trmCodigo')
  @RequirePermission('turma', 'read')
  obter(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('trmCodigo', ParseIntPipe) trmCodigo: number,
  ) {
    return this.service.executar(instituicaoCodigo, (core) => core.obter(trmCodigo));
  }

  @Put(':trmCodigo/validacao')
  @RequirePermission('turma', 'update')
  salvar(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('trmCodigo', ParseIntPipe) trmCodigo: number,
    @Body() dto: TurmaValidacaoDto,
    @Req() req: any,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.salvarValidacao(trmCodigo, dto, { usuario: req.user?.userId }),
    );
  }

  @Post(':trmCodigo/sincronizar')
  @RequirePermission('turma', 'sync')
  sincronizar(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('trmCodigo', ParseIntPipe) trmCodigo: number,
    @Body() dto: TurmaSincronizarDto,
  ) {
    return this.service.executar(instituicaoCodigo, (core) =>
      core.sincronizar({ TRMCodigo: trmCodigo, EQPCodigos: dto.EQPCodigos, forcar: dto.forcar }),
    );
  }
}
