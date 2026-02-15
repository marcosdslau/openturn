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

    @Delete('versions/:versionId')
    async deleteVersion(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('versionId', ParseIntPipe) versionId: number,
    ) {
        return this.rotinaService.deleteVersion(versionId, instituicaoCodigo);
    }
}
