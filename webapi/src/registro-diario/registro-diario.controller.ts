import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { RegistroDiarioService } from './registro-diario.service';
import { RegistroDiarioManutencaoService } from './registro-diario-manutencao.service';
import { GenneraAttendanceService } from './gennera-attendance.service';
import { QueryRegistroDiarioDto, IniciarLancamentoGenneraDto } from './dto/registro-diario.dto';
import {
  ReprocessarPeriodoDto,
  QueryManutencaoRegistroDiarioDto,
  ManutencaoFiltrosDto,
  CriarManualRegistroDiarioDto,
  AlterarRegistrosDiariosDto,
  ExcluirRegistrosDiariosDto,
  UpdateRegistroDiarioDto,
} from './dto/registro-diario-manutencao.dto';
import { randomUUID } from 'crypto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/registro-diario')
export class RegistroDiarioController {
  constructor(
    private readonly registroDiarioService: RegistroDiarioService,
    private readonly manutencaoService: RegistroDiarioManutencaoService,
    private readonly genneraService: GenneraAttendanceService,
  ) {}

  // ---------------------------------------------------------------------------
  // Listagem principal
  // ---------------------------------------------------------------------------

  @Get()
  @RequirePermission('registroDiario', 'read')
  findAll(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Query() query: QueryRegistroDiarioDto,
  ) {
    return this.registroDiarioService.findAll(instituicaoCodigo, query);
  }

  // ---------------------------------------------------------------------------
  // Sync e reprocessamento (execute — Gestor+)
  // ---------------------------------------------------------------------------

  @Post('sync')
  @RequirePermission('registroDiario', 'execute')
  triggerSync(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
  ) {
    return this.manutencaoService.triggerSync(instituicaoCodigo);
  }

  @Post('reprocessar-periodo')
  @RequirePermission('registroDiario', 'execute')
  reprocessarPeriodo(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: ReprocessarPeriodoDto,
  ) {
    return this.manutencaoService.reprocessarPeriodo(instituicaoCodigo, dto);
  }

  // ---------------------------------------------------------------------------
  // Manutenção — listagem avançada (read)
  // ---------------------------------------------------------------------------

  @Get('manutencao')
  @RequirePermission('registroDiario', 'read')
  findManutencao(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Query() query: QueryManutencaoRegistroDiarioDto,
  ) {
    return this.manutencaoService.findManutencao(instituicaoCodigo, query);
  }

  // ---------------------------------------------------------------------------
  // Manutenção — criação manual (create — Admin+)
  // ---------------------------------------------------------------------------

  @Post('manutencao/preview-criacao')
  @RequirePermission('registroDiario', 'create')
  previewCriacaoManual(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() filtros: ManutencaoFiltrosDto,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.manutencaoService.previewCriacaoManual(
      instituicaoCodigo,
      filtros,
      Number(page),
      Number(limit),
    );
  }

  @Post('manutencao/criar-manual')
  @RequirePermission('registroDiario', 'create')
  criarManual(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: CriarManualRegistroDiarioDto,
    @Req() req: any,
  ) {
    const userId: number = req.user?.userId;
    return this.manutencaoService.criarManual(instituicaoCodigo, dto, userId);
  }

  // ---------------------------------------------------------------------------
  // Manutenção — operações em lote (delete / update — Admin+)
  // ---------------------------------------------------------------------------

  @Post('manutencao/excluir')
  @RequirePermission('registroDiario', 'delete')
  excluirBulk(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: ExcluirRegistrosDiariosDto,
  ) {
    return this.manutencaoService.excluirBulk(instituicaoCodigo, dto);
  }

  @Patch('manutencao/alterar')
  @RequirePermission('registroDiario', 'update')
  alterarBulk(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: AlterarRegistrosDiariosDto,
    @Req() req: any,
  ) {
    const userId: number = req.user?.userId;
    return this.manutencaoService.alterarBulk(instituicaoCodigo, dto, userId);
  }

  // ---------------------------------------------------------------------------
  // Edição / exclusão unitária (Admin+)
  // ---------------------------------------------------------------------------

  @Patch(':rpdCodigo')
  @RequirePermission('registroDiario', 'update')
  updateOne(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('rpdCodigo', ParseIntPipe) rpdCodigo: number,
    @Body() dto: UpdateRegistroDiarioDto,
    @Req() req: any,
  ) {
    const userId: number = req.user?.userId;
    return this.manutencaoService.updateOne(rpdCodigo, instituicaoCodigo, dto, userId);
  }

  @Delete(':rpdCodigo')
  @RequirePermission('registroDiario', 'delete')
  deleteOne(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('rpdCodigo', ParseIntPipe) rpdCodigo: number,
  ) {
    return this.manutencaoService.deleteOne(rpdCodigo, instituicaoCodigo);
  }

  // ---------------------------------------------------------------------------
  // Gennera
  // ---------------------------------------------------------------------------

  @Post('gennera/lancamento')
  @RequirePermission('registroDiario', 'execute')
  async iniciarLancamento(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() dto: IniciarLancamentoGenneraDto,
  ) {
    const jobId = randomUUID();
    await this.genneraService.iniciarLancamento(jobId, instituicaoCodigo, dto);
    return { jobId };
  }

  @Get('gennera/lancamento/:jobId')
  @RequirePermission('registroDiario', 'execute')
  async getJobStatus(
    @Param('instituicaoCodigo', ParseIntPipe) _instituicaoCodigo: number,
    @Param('jobId') jobId: string,
  ) {
    const status = await this.genneraService.getJobStatus(jobId);
    if (!status) throw new NotFoundException('Job não encontrado');
    return status;
  }
}
