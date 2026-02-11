import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { EquipamentoService } from './equipamento.service';
import { CreateEquipamentoDto, UpdateEquipamentoDto } from './dto/equipamento.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN, GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
@Controller('equipamentos')
export class EquipamentoController {
    constructor(private service: EquipamentoService) { }

    @Post()
    create(@Body() dto: CreateEquipamentoDto) {
        return this.service.create(dto);
    }

    @Get()
    findAll(@Query() query: PaginationDto) {
        return this.service.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEquipamentoDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
