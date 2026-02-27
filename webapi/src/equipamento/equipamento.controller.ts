import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { EquipamentoService } from './equipamento.service';
import { CreateEquipamentoDto, UpdateEquipamentoDto } from './dto/equipamento.dto';
import { ProxyHttpDto } from '../connector/dto/connector.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
@Controller('instituicao/:instituicaoCodigo/equipamento')
export class EquipamentoController {
    constructor(private service: EquipamentoService) { }

    @Post()
    create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: CreateEquipamentoDto
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

    @Patch(':id')
    update(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateEquipamentoDto
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

    @Post(':id/proxy-http')
    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN, GrupoAcesso.GESTOR, GrupoAcesso.OPERACAO)
    proxyHttp(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: ProxyHttpDto,
    ) {
        return this.service.proxyHttp(
            instituicaoCodigo,
            id,
            dto.method,
            dto.path,
            dto.headers,
            dto.body,
        );
    }
}
