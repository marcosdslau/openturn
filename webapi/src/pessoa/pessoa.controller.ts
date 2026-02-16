import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PessoaService } from './pessoa.service';
import { CreatePessoaDto, UpdatePessoaDto } from './dto/pessoa.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
@Controller('instituicao/:instituicaoCodigo/pessoa')
export class PessoaController {
    constructor(private service: PessoaService) { }

    @Post()
    create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: CreatePessoaDto
    ) {
        return this.service.create(instituicaoCodigo, dto);
    }

    @Get()
    findAll(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Query() query: PaginationDto
    ) {
        return this.service.findAll(instituicaoCodigo, query);
    }

    @Get(':id')
    findOne(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.service.findOne(instituicaoCodigo, id);
    }

    @Put(':id')
    update(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePessoaDto
    ) {
        return this.service.update(instituicaoCodigo, id, dto);
    }

    @Patch(':id')
    patch(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePessoaDto
    ) {
        return this.service.update(instituicaoCodigo, id, dto);
    }

    @Delete(':id')
    remove(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.service.remove(instituicaoCodigo, id);
    }
}
