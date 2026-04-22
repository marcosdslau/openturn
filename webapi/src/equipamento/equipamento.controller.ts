import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { EquipamentoService } from './equipamento.service';
import { CreateEquipamentoDto, UpdateEquipamentoDto } from './dto/equipamento.dto';
import { ProxyHttpDto } from '../connector/dto/connector.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instituicao/:instituicaoCodigo/equipamento')
export class EquipamentoController {
    constructor(private service: EquipamentoService) {}

    @Post()
    @RequirePermission('equipamento', 'create')
    create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: CreateEquipamentoDto,
    ) {
        return this.service.create(instituicaoCodigo, dto);
    }

    @Get()
    @RequirePermission('equipamento', 'read')
    findAll(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Query() query: PaginationDto,
    ) {
        return this.service.findAll(instituicaoCodigo, query);
    }

    @Get(':id')
    @RequirePermission('equipamento', 'read')
    findOne(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.findOne(instituicaoCodigo, id);
    }

    @Patch(':id')
    @RequirePermission('equipamento', 'update')
    update(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateEquipamentoDto,
    ) {
        return this.service.update(instituicaoCodigo, id, dto);
    }

    @Delete(':id')
    @RequirePermission('equipamento', 'delete')
    remove(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.service.remove(instituicaoCodigo, id);
    }

    @Post(':id/proxy-http')
    @RequirePermission('equipamento', 'proxy_http')
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
