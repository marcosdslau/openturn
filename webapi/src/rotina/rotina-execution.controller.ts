import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    ParseIntPipe,
    UseGuards,
    Query,
    Delete,
} from '@nestjs/common';
import { RotinaExecutionService } from './rotina-execution.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatusExecucao } from '@prisma/client';

@Controller('instituicao/:instituicaoCodigo/execucoes')
@UseGuards(JwtAuthGuard)
export class RotinaExecutionController {
    constructor(private readonly executionService: RotinaExecutionService) { }

    @Get()
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
        @Body() data: { action: 'delete' | 'reprocess' | 'cancel'; ids: string[] }
    ) {
        return this.executionService.bulkAction(instituicaoCodigo, data);
    }

    @Post(':exeId/reprocess')
    async reprocess(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('exeId') exeId: string,
    ) {
        return this.executionService.reprocess(exeId, instituicaoCodigo);
    }
}
