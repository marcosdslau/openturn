import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    UseGuards,
    Req,
    Query,
} from '@nestjs/common';
import { RotinaService } from './rotina.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@Controller('instituicao/:instituicaoCodigo/rotina')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RotinaController {
    constructor(private readonly rotinaService: RotinaService) {}

    @Get()
    @RequirePermission('rotina', 'read')
    async findAll(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
        return this.rotinaService.findAll(instituicaoCodigo);
    }

    @Get('execucoes-ativas/mapa')
    @RequirePermission('rotina', 'read')
    async getActiveExecutionsMap(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        return this.rotinaService.getActiveExecutionsMap(instituicaoCodigo);
    }

    @Get(':id/execucao-ativa')
    @RequirePermission('rotina', 'read')
    async getActiveExecution(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.getActiveExecution(id, instituicaoCodigo);
    }

    @Get(':id')
    @RequirePermission('rotina', 'read')
    async findOne(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.findOne(id, instituicaoCodigo);
    }

    @Post()
    @RequirePermission('rotina', 'create')
    async create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() data: any,
        @Req() req: any,
    ) {
        const usuarioCodigo = req.user?.userId;
        const finalInstituicaoCodigo = instituicaoCodigo || data.INSInstituicaoCodigo;
        return this.rotinaService.create(data, finalInstituicaoCodigo, usuarioCodigo);
    }

    @Put(':id')
    @RequirePermission('rotina', 'update')
    async update(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() data: any,
        @Req() req: any,
    ) {
        const usuarioCodigo = req.user?.userId;
        return this.rotinaService.update(id, data, instituicaoCodigo, usuarioCodigo);
    }

    @Delete(':id')
    @RequirePermission('rotina', 'delete')
    async remove(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.remove(id, instituicaoCodigo);
    }

    @Post(':id/execute')
    @RequirePermission('rotina', 'execute')
    async execute(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.executeManual(id, instituicaoCodigo);
    }

    @Post(':id/serial-lock/clear')
    @RequirePermission('rotina', 'clear_serial_lock')
    async clearSerialLock(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.clearSerialExecutionLock(id, instituicaoCodigo);
    }

    @Post(':id/execucoes/:exeId/cancel')
    @RequirePermission('rotina', 'cancel_run')
    async cancelExecution(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('exeId') exeId: string,
    ) {
        return this.rotinaService.cancelExecution(exeId, id, instituicaoCodigo);
    }

    @Get(':id/execucoes/:exeId')
    @RequirePermission('rotina', 'read')
    async getExecution(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('exeId') exeId: string,
    ) {
        return this.rotinaService.getExecution(exeId, instituicaoCodigo);
    }

    @Get(':id/versions')
    @RequirePermission('rotina', 'read')
    async getVersions(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.getVersions(id, instituicaoCodigo);
    }

    @Post('versions/:versionId/restore')
    @RequirePermission('rotina', 'manage_versions')
    async restoreVersion(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('versionId', ParseIntPipe) versionId: number,
        @Req() req: any,
    ) {
        const usuarioCodigo = req.user?.userId;
        return this.rotinaService.restoreVersion(versionId, instituicaoCodigo, usuarioCodigo);
    }

    @Delete('versions/bulk')
    @RequirePermission('rotina', 'manage_versions')
    async deleteVersions(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() body: { ids: number[] },
    ) {
        return this.rotinaService.deleteVersions(body.ids, instituicaoCodigo);
    }

    @Delete('versions/:versionId')
    @RequirePermission('rotina', 'manage_versions')
    async deleteVersion(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('versionId', ParseIntPipe) versionId: number,
    ) {
        return this.rotinaService.deleteVersion(versionId, instituicaoCodigo);
    }

    @Get(':id/logs')
    @RequirePermission('rotina', 'read')
    async getLogs(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('search') search?: string,
        @Query('levels') levels?: string | string[],
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        const levelsArray = levels ? (Array.isArray(levels) ? levels : [levels]) : undefined;
        return this.rotinaService.getExecutionLogs(
            id,
            instituicaoCodigo,
            search,
            limit || 50,
            levelsArray,
            startDate,
            endDate,
        );
    }
}
