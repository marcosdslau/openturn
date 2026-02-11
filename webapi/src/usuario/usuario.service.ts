import { Injectable, NotFoundException, ForbiddenException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUsuarioDto, UpdateUsuarioDto, CreateAcessoDto } from './dto/usuario.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/profile.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { GrupoAcesso } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const HIERARCHY: Record<string, number> = {
    [GrupoAcesso.SUPER_ROOT]: 5,
    [GrupoAcesso.SUPER_ADMIN]: 4,
    [GrupoAcesso.ADMIN]: 3,
    [GrupoAcesso.GESTOR]: 2,
    [GrupoAcesso.OPERACAO]: 1,
};

@Injectable()
export class UsuarioService {
    constructor(
        private prisma: PrismaService,
        private authService: AuthService,
    ) { }

    async create(dto: CreateUsuarioDto) {
        const existing = await this.prisma.uSRUsuario.findUnique({
            where: { USREmail: dto.email },
        });

        if (existing) {
            throw new ConflictException(`Email ${dto.email} já está em uso`);
        }

        const senhaHash = await this.authService.hashSenha(dto.senha);

        return this.prisma.uSRUsuario.create({
            data: {
                USRNome: dto.nome,
                USREmail: dto.email,
                USRSenha: senhaHash,
            },
        });
    }

    async findAll(query: PaginationDto, activeScope: any): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        // Build filter conditions
        const whereConditions: any = {
            acessos: {
                some: {
                    // Exclude SUPER_ADMIN and SUPER_ROOT
                    grupo: {
                        notIn: [GrupoAcesso.SUPER_ADMIN, GrupoAcesso.SUPER_ROOT],
                    },
                },
            },
        };

        // Filter by institution if activeScope has instituicaoId
        if (activeScope?.instituicaoId) {
            whereConditions.acessos.some.INSInstituicaoCodigo = activeScope.instituicaoId;
        }

        const [data, total] = await Promise.all([
            this.prisma.uSRUsuario.findMany({
                where: whereConditions,
                skip,
                take: limit,
                select: {
                    USRCodigo: true,
                    USRNome: true,
                    USREmail: true,
                    createdAt: true,
                    acessos: {
                        where: {
                            // Only show acessos for the current institution
                            ...(activeScope?.instituicaoId
                                ? { INSInstituicaoCodigo: activeScope.instituicaoId }
                                : {}),
                        },
                        select: {
                            UACCodigo: true,
                            grupo: true,
                            CLICodigo: true,
                            INSInstituicaoCodigo: true,
                            cliente: { select: { CLINome: true } },
                            instituicao: { select: { INSNome: true } },
                        },
                    },
                },
                orderBy: { USRCodigo: 'desc' },
            }),
            this.prisma.uSRUsuario.count({ where: whereConditions }),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: number) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: id },
            select: {
                USRCodigo: true,
                USRNome: true,
                USREmail: true,
                createdAt: true,
                acessos: {
                    select: {
                        UACCodigo: true,
                        grupo: true,
                        CLICodigo: true,
                        INSInstituicaoCodigo: true,
                        cliente: { select: { CLINome: true } },
                        instituicao: { select: { INSNome: true } },
                    },
                },
            },
        });
        if (!usuario) throw new NotFoundException(`Usuário ${id} não encontrado`);
        return usuario;
    }

    async update(id: number, dto: UpdateUsuarioDto) {
        await this.findOne(id);

        const data: any = {};
        if (dto.nome) data.USRNome = dto.nome;
        if (dto.email) data.USREmail = dto.email;
        if (dto.senha) data.USRSenha = await this.authService.hashSenha(dto.senha);

        return this.prisma.uSRUsuario.update({
            where: { USRCodigo: id },
            data,
        });
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.uSRUsuario.delete({ where: { USRCodigo: id } });
    }

    async addAcesso(userId: number, dto: CreateAcessoDto, creatorAcessos: any[]) {
        // Validate hierarchy: creator cannot grant a role higher than their own
        const creatorMaxLevel = Math.max(
            ...creatorAcessos.map((a: any) => HIERARCHY[a.grupo] || 0),
        );
        const targetLevel = HIERARCHY[dto.grupo] || 0;

        if (targetLevel >= creatorMaxLevel) {
            throw new ForbiddenException(
                'Não é possível atribuir um papel igual ou superior ao seu',
            );
        }

        await this.findOne(userId);

        return this.prisma.uSRAcesso.create({
            data: {
                USRCodigo: userId,
                grupo: dto.grupo,
                CLICodigo: dto.clienteId ?? null,
                INSInstituicaoCodigo: dto.instituicaoId ?? null,
            },
        });
    }

    async removeAcesso(acessoId: number) {
        const acesso = await this.prisma.uSRAcesso.findUnique({
            where: { UACCodigo: acessoId },
        });
        if (!acesso) throw new NotFoundException(`Acesso ${acessoId} não encontrado`);
        return this.prisma.uSRAcesso.delete({ where: { UACCodigo: acessoId } });
    }

    // Profile management methods
    async getProfile(userId: number) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: userId },
            select: {
                USRCodigo: true,
                USRNome: true,
                USREmail: true,
                USRTelefone: true,
                USRBio: true,
                USRFotoUrl: true,
                USRFacebook: true,
                USRTwitter: true,
                USRLinkedin: true,
                USRInstagram: true,
                USRPais: true,
                USRCidade: true,
                USREstado: true,
                USRCep: true,
                USRTaxId: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!usuario) {
            throw new NotFoundException(`Usuário ${userId} não encontrado`);
        }

        return usuario;
    }

    async updateProfile(userId: number, dto: UpdateProfileDto) {
        await this.getProfile(userId);

        const data: any = {};
        if (dto.nome !== undefined) data.USRNome = dto.nome;
        if (dto.telefone !== undefined) data.USRTelefone = dto.telefone;
        if (dto.bio !== undefined) data.USRBio = dto.bio;
        if (dto.fotoUrl !== undefined) data.USRFotoUrl = dto.fotoUrl;
        if (dto.facebook !== undefined) data.USRFacebook = dto.facebook;
        if (dto.twitter !== undefined) data.USRTwitter = dto.twitter;
        if (dto.linkedin !== undefined) data.USRLinkedin = dto.linkedin;
        if (dto.instagram !== undefined) data.USRInstagram = dto.instagram;
        if (dto.pais !== undefined) data.USRPais = dto.pais;
        if (dto.cidade !== undefined) data.USRCidade = dto.cidade;
        if (dto.estado !== undefined) data.USREstado = dto.estado;
        if (dto.cep !== undefined) data.USRCep = dto.cep;
        if (dto.taxId !== undefined) data.USRTaxId = dto.taxId;

        return this.prisma.uSRUsuario.update({
            where: { USRCodigo: userId },
            data,
            select: {
                USRCodigo: true,
                USRNome: true,
                USREmail: true,
                USRTelefone: true,
                USRBio: true,
                USRFotoUrl: true,
                USRFacebook: true,
                USRTwitter: true,
                USRLinkedin: true,
                USRInstagram: true,
                USRPais: true,
                USRCidade: true,
                USREstado: true,
                USRCep: true,
                USRTaxId: true,
                updatedAt: true,
            },
        });
    }

    async changePassword(userId: number, dto: ChangePasswordDto) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: userId },
        });

        if (!usuario) {
            throw new NotFoundException(`Usuário ${userId} não encontrado`);
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(
            dto.currentPassword,
            usuario.USRSenha,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Senha atual incorreta');
        }

        // Hash new password
        const newPasswordHash = await this.authService.hashSenha(dto.newPassword);

        await this.prisma.uSRUsuario.update({
            where: { USRCodigo: userId },
            data: { USRSenha: newPasswordHash },
        });

        return { message: 'Senha alterada com sucesso' };
    }
}
