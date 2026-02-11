import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { UsuarioService } from './usuario.service';
import { CreateUsuarioDto, UpdateUsuarioDto, CreateAcessoDto } from './dto/usuario.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/profile.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@Controller('usuarios')
export class UsuarioController {
    constructor(private service: UsuarioService) { }

    // Profile management endpoints (accessible by any authenticated user)
    @Get('profile')
    @UseGuards(JwtAuthGuard)
    getProfile(@Request() req: any) {
        return this.service.getProfile(req.user.userId);
    }

    @Patch('profile')
    @UseGuards(JwtAuthGuard)
    updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
        return this.service.updateProfile(req.user.userId, dto);
    }

    @Post('change-password')
    @UseGuards(JwtAuthGuard)
    changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
        return this.service.changePassword(req.user.userId, dto);
    }

    // Admin endpoints (require ADMIN or GESTOR role)
    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
    create(@Body() dto: CreateUsuarioDto) {
        return this.service.create(dto);
    }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
    findAll(@Query() query: PaginationDto, @Request() req: any) {
        return this.service.findAll(query, req.user.activeScope);
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUsuarioDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }

    @Post(':id/acessos')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
    addAcesso(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateAcessoDto,
        @Request() req: any,
    ) {
        return this.service.addAcesso(id, dto, req.user.acessos);
    }

    @Delete('acessos/:acessoId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(GrupoAcesso.ADMIN, GrupoAcesso.GESTOR)
    removeAcesso(@Param('acessoId', ParseIntPipe) acessoId: number) {
        return this.service.removeAcesso(acessoId);
    }
}
