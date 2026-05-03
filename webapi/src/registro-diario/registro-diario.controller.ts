import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { RegistroDiarioService } from './registro-diario.service';
import { GenneraAttendanceService } from './gennera-attendance.service';
import { QueryRegistroDiarioDto, IniciarLancamentoGenneraDto } from './dto/registro-diario.dto';
import { randomUUID } from 'crypto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/registro-diario')
export class RegistroDiarioController {
  constructor(
    private readonly registroDiarioService: RegistroDiarioService,
    private readonly genneraService: GenneraAttendanceService,
  ) {}

  @Get()
  @RequirePermission('registroDiario', 'read')
  findAll(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Query() query: QueryRegistroDiarioDto,
  ) {
    return this.registroDiarioService.findAll(instituicaoCodigo, query);
  }

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
