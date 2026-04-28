import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { BulkExecucoesDto } from './dto/bulk-execucoes.dto';
import { RotinaExecutionService } from './rotina-execution.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { assertInstitutionPermission } from '../auth/assert-institution-permission';
import { StatusExecucao } from '@prisma/client';

@Controller('instituicao/:instituicaoCodigo/execucoes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RotinaExecutionController {
  constructor(private readonly executionService: RotinaExecutionService) {}

  @Get()
  @RequirePermission('execucao', 'read')
  async listExecutions(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('rotinaCodigo') rotinaCodigo?: number,
    @Query('status') status?: StatusExecucao,
    @Query('trigger') trigger?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('searchError') searchError?: string,
    @Query('searchLog') searchLog?: string,
    @Query('searchBody') searchBody?: string,
    @Query('executionId') executionId?: string,
  ) {
    return this.executionService.listExecutions(instituicaoCodigo, {
      page,
      limit,
      rotinaCodigo,
      status,
      trigger,
      startDate,
      endDate,
      searchError,
      searchLog,
      searchBody,
      executionId,
    });
  }

  @Post('bulk')
  async bulkAction(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Body() data: BulkExecucoesDto,
    @Req() req: any,
  ) {
    const { action } = data;
    if (action === 'delete') {
      assertInstitutionPermission(
        req.user,
        instituicaoCodigo,
        'execucao',
        'delete',
      );
    } else if (action === 'reprocess') {
      assertInstitutionPermission(
        req.user,
        instituicaoCodigo,
        'execucao',
        'reprocess',
      );
    } else if (action === 'cancel') {
      assertInstitutionPermission(
        req.user,
        instituicaoCodigo,
        'execucao',
        'cancel_run',
      );
    }
    return this.executionService.bulkAction(instituicaoCodigo, data);
  }

  @Post(':exeId/reprocess')
  @RequirePermission('execucao', 'reprocess')
  async reprocess(
    @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    @Param('exeId') exeId: string,
  ) {
    return this.executionService.reprocess(exeId, instituicaoCodigo);
  }
}
