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
@Controller('instituicao/:instituicaoCodigo/usuario')
export class InstituicaoUsuarioController {
    constructor(private service: UsuarioService) { }

    @Post()
    create(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Body() dto: CreateUsuarioDto
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
        @Body() dto: UpdateUsuarioDto
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

    @Post(':id/acessos')
    addAcesso(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateAcessoDto,
        @Request() req: any,
    ) {
        return this.service.addAcesso(instituicaoCodigo, id, dto, req.user.acessos);
    }

    @Delete('acessos/:acessoId')
    removeAcesso(
        @Param('instituicaoCodigo', ParseIntPipe) instituicaoCodigo: number,
        @Param('acessoId', ParseIntPipe) acessoId: number
    ) {
        return this.service.removeAcesso(instituicaoCodigo, acessoId);
    }
}
