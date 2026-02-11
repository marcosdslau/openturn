import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { InstituicaoService } from './instituicao.service';
import { CreateInstituicaoDto, UpdateInstituicaoDto } from './dto/instituicao.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instituicoes')
export class InstituicaoController {
    constructor(private service: InstituicaoService) { }

    @Roles(GrupoAcesso.SUPER_ROOT)
    @Post()
    create(@Body() dto: CreateInstituicaoDto) {
        return this.service.create(dto);
    }

    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    @Get()
    findAll(@Query() query: PaginationDto) {
        return this.service.findAll(query);
    }

    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
    @Put(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInstituicaoDto) {
        return this.service.update(id, dto);
    }

    @Roles(GrupoAcesso.SUPER_ROOT)
    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }
}
