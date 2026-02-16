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

@Controller('instituicao/:instituicaoCodigo/rotina')
@UseGuards(JwtAuthGuard)
export class RotinaController {
    constructor(private readonly rotinaService: RotinaService) { }

    @Get()
    async findAll(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        return this.rotinaService.findAll(instituicaoCodigo);
    }

    @Get(':id')
    async findOne(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.findOne(id, instituicaoCodigo);
    }

    @Post()
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
    async remove(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.remove(id, instituicaoCodigo);
    }

    @Post(':id/execute')
    async execute(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.executeManual(id, instituicaoCodigo);
    }

    @Get(':id/versions')
    async getVersions(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.rotinaService.getVersions(id, instituicaoCodigo);
    }

    @Post('versions/:versionId/restore')
    async restoreVersion(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('versionId', ParseIntPipe) versionId: number,
        @Req() req: any,
    ) {
        const usuarioCodigo = req.user?.userId;
        return this.rotinaService.restoreVersion(
            versionId,
            instituicaoCodigo,
            usuarioCodigo,
        );
    }

    @Delete('versions/bulk')
    async deleteVersions(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() body: { ids: number[] },
    ) {
        return this.rotinaService.deleteVersions(body.ids, instituicaoCodigo);
    }

    @Delete('versions/:versionId')
    async deleteVersion(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('versionId', ParseIntPipe) versionId: number,
    ) {
        return this.rotinaService.deleteVersion(versionId, instituicaoCodigo);
    }

    @Get(':id/logs')
    async getLogs(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Query('search') search?: string,
        @Query('levels') levels?: string | string[],
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    ) {
        // Normalize levels to array
        const levelsArray = levels ? (Array.isArray(levels) ? levels : [levels]) : undefined;
        return this.rotinaService.getExecutionLogs(id, instituicaoCodigo, search, limit || 50, levelsArray, startDate, endDate);
    }
}
