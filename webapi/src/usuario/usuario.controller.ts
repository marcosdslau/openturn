import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { UsuarioService } from './usuario.service';
import { CreateUsuarioDto, UpdateUsuarioDto, CreateAcessoDto } from './dto/usuario.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
@Controller('usuarios')
export class UsuarioController {
    constructor(private service: UsuarioService) { }

    @Post()
    create(@Body() dto: CreateUsuarioDto) {
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

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUsuarioDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }

    @Post(':id/acessos')
    addAcesso(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateAcessoDto,
        @Request() req: any,
    ) {
        return this.service.addAcesso(id, dto, req.user.acessos);
    }

    @Delete('acessos/:acessoId')
    removeAcesso(@Param('acessoId', ParseIntPipe) acessoId: number) {
        return this.service.removeAcesso(acessoId);
    }
}
