import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateAdminUsuarioDto, UpdateAdminUsuarioDto, ResetPasswordDto } from './dto/admin-usuario.dto';
import { GrupoAcesso } from '@prisma/client';

const ADMIN_GROUPS = [GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN];

@Injectable()
export class AdminUsuarioService {
    constructor(
        private prisma: PrismaService,
        private authService: AuthService,
    ) { }

    private getAllowedGroups(callerGrupo: string): GrupoAcesso[] {
        if (callerGrupo === GrupoAcesso.SUPER_ROOT) {
            return [GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN];
        }
        return [GrupoAcesso.SUPER_ADMIN];
    }

    async findAll(callerGrupo: string, search?: string) {
        const allowedGroups = this.getAllowedGroups(callerGrupo);

        const whereConditions: any = {
            acessos: {
                some: {
                    grupo: { in: allowedGroups },
                },
            },
        };

        if (search) {
            whereConditions.OR = [
                { USRNome: { contains: search, mode: 'insensitive' } },
                { USREmail: { contains: search, mode: 'insensitive' } },
            ];
        }

        const data = await this.prisma.uSRUsuario.findMany({
            where: whereConditions,
            select: {
                USRCodigo: true,
                USRNome: true,
                USREmail: true,
                USRAtivo: true,
                createdAt: true,
                acessos: {
                    where: { grupo: { in: ADMIN_GROUPS } },
                    select: {
                        UACCodigo: true,
                        grupo: true,
                    },
                },
            },
            orderBy: { USRCodigo: 'desc' },
        });

        return data;
    }

    async create(dto: CreateAdminUsuarioDto, callerGrupo: string) {
        const allowedGroups = this.getAllowedGroups(callerGrupo);

        if (!allowedGroups.includes(dto.grupo)) {
            throw new ForbiddenException(
                'Você não tem permissão para criar usuários com este perfil',
            );
        }

        const existing = await this.prisma.uSRUsuario.findUnique({
            where: { USREmail: dto.email },
        });

        if (existing) {
            throw new ConflictException('Email já cadastrado');
        }

        const senhaHash = await this.authService.hashSenha(dto.senha);

        const usuario = await this.prisma.uSRUsuario.create({
            data: {
                USRNome: dto.nome,
                USREmail: dto.email,
                USRSenha: senhaHash,
            },
        });

        await this.prisma.uSRAcesso.create({
            data: {
                USRCodigo: usuario.USRCodigo,
                grupo: dto.grupo,
                CLICodigo: null,
                INSInstituicaoCodigo: null,
            },
        });

        return {
            USRCodigo: usuario.USRCodigo,
            USRNome: usuario.USRNome,
            USREmail: usuario.USREmail,
            USRAtivo: usuario.USRAtivo,
            grupo: dto.grupo,
        };
    }

    async update(id: number, dto: UpdateAdminUsuarioDto) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: id },
        });
        if (!usuario) throw new NotFoundException(`Usuário ${id} não encontrado`);

        const data: any = {};
        if (dto.nome) data.USRNome = dto.nome;
        if (dto.email) data.USREmail = dto.email;

        return this.prisma.uSRUsuario.update({
            where: { USRCodigo: id },
            data,
            select: {
                USRCodigo: true,
                USRNome: true,
                USREmail: true,
                USRAtivo: true,
            },
        });
    }

    async resetPassword(id: number, dto: ResetPasswordDto) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: id },
        });
        if (!usuario) throw new NotFoundException(`Usuário ${id} não encontrado`);

        const newHash = await this.authService.hashSenha(dto.newPassword);

        await this.prisma.uSRUsuario.update({
            where: { USRCodigo: id },
            data: { USRSenha: newHash },
        });

        return { message: 'Senha alterada com sucesso' };
    }

    async toggleActive(id: number) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: id },
        });
        if (!usuario) throw new NotFoundException(`Usuário ${id} não encontrado`);

        return this.prisma.uSRUsuario.update({
            where: { USRCodigo: id },
            data: { USRAtivo: !usuario.USRAtivo },
            select: {
                USRCodigo: true,
                USRNome: true,
                USRAtivo: true,
            },
        });
    }

    async remove(id: number) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: id },
        });
        if (!usuario) throw new NotFoundException(`Usuário ${id} não encontrado`);

        return this.prisma.uSRUsuario.delete({ where: { USRCodigo: id } });
    }
}
