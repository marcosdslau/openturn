import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PessoaService } from './pessoa.service';
import { CreatePessoaDto, UpdatePessoaDto, QueryPessoaDto } from './dto/pessoa.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/pessoa')
export class PessoaController {
    constructor(private service: PessoaService) {}

    @Post()
    @RequirePermission('pessoa', 'create')
    create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: CreatePessoaDto,
    ) {
        return this.service.create(instituicaoCodigo, dto);
    }

    @Get()
    @RequirePermission('pessoa', 'read')
    findAll(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Query() query: QueryPessoaDto,
    ) {
        return this.service.findAll(instituicaoCodigo, query);
    }

    @Get('grupos')
    @RequirePermission('pessoa', 'read')
    listGrupos(@Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number) {
        return this.service.findDistinctGrupos(instituicaoCodigo);
    }

    @Get(':id/mappings')
    @RequirePermission('pessoa', 'read')
    getMappings(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.findMappings(instituicaoCodigo, id);
    }

    @Get(':id')
    @RequirePermission('pessoa', 'read')
    findOne(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.findOne(instituicaoCodigo, id);
    }

    @Put(':id')
    @RequirePermission('pessoa', 'update')
    update(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePessoaDto,
    ) {
        return this.service.update(instituicaoCodigo, id, dto);
    }

    @Patch(':id')
    @RequirePermission('pessoa', 'update')
    patch(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePessoaDto,
    ) {
        return this.service.update(instituicaoCodigo, id, dto);
    }

    @Delete(':id')
    @RequirePermission('pessoa', 'delete')
    remove(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.remove(instituicaoCodigo, id);
    }
}
