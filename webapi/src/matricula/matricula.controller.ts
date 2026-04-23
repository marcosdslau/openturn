import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { MatriculaService } from './matricula.service';
import { CreateMatriculaDto, QueryMatriculaDto, UpdateMatriculaDto } from './dto/matricula.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/matricula')
export class MatriculaController {
    constructor(private service: MatriculaService) {}

    @Post()
    @RequirePermission('matricula', 'create')
    create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: CreateMatriculaDto,
    ) {
        return this.service.create(instituicaoCodigo, dto);
    }

    @Get()
    @RequirePermission('matricula', 'read')
    findAll(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Query() query: QueryMatriculaDto,
    ) {
        return this.service.findAll(instituicaoCodigo, query);
    }

    @Get('opcoes-filtro')
    @RequirePermission('matricula', 'read')
    findOpcoesFiltro(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
    ) {
        return this.service.findOpcoesFiltro(instituicaoCodigo);
    }

    @Get(':id')
    @RequirePermission('matricula', 'read')
    findOne(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.findOne(instituicaoCodigo, id);
    }

    @Put(':id')
    @RequirePermission('matricula', 'update')
    update(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateMatriculaDto,
    ) {
        return this.service.update(instituicaoCodigo, id, dto);
    }

    @Patch(':id')
    @RequirePermission('matricula', 'update')
    patch(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateMatriculaDto,
    ) {
        return this.service.update(instituicaoCodigo, id, dto);
    }

    @Delete(':id')
    @RequirePermission('matricula', 'delete')
    remove(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.remove(instituicaoCodigo, id);
    }
}
