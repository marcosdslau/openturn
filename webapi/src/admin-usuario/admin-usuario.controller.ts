import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    ParseIntPipe, UseGuards, Request,
} from '@nestjs/common';
import { AdminUsuarioService } from './admin-usuario.service';
import { CreateAdminUsuarioDto, UpdateAdminUsuarioDto, ResetPasswordDto } from './dto/admin-usuario.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GrupoAcesso } from '@prisma/client';

@Controller('admin-usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN)
export class AdminUsuarioController {
    constructor(private service: AdminUsuarioService) { }

    @Get()
    findAll(@Request() req: any, @Query('search') search?: string) {
        const callerGrupo = this.getCallerGrupo(req);
        return this.service.findAll(callerGrupo, search);
    }

    @Post()
    create(@Body() dto: CreateAdminUsuarioDto, @Request() req: any) {
        const callerGrupo = this.getCallerGrupo(req);
        return this.service.create(dto, callerGrupo);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminUsuarioDto) {
        return this.service.update(id, dto);
    }

    @Patch(':id/senha')
    resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
        return this.service.resetPassword(id, dto);
    }

    @Patch(':id/inativar')
    toggleActive(@Param('id', ParseIntPipe) id: number) {
        return this.service.toggleActive(id);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.service.remove(id);
    }

    private getCallerGrupo(req: any): string {
        const acessos = req.user?.acessos || [];
        if (acessos.some((a: any) => a.grupo === GrupoAcesso.SUPER_ROOT)) {
            return GrupoAcesso.SUPER_ROOT;
        }
        return GrupoAcesso.SUPER_ADMIN;
    }
}
