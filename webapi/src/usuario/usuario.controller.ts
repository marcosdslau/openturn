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
}

