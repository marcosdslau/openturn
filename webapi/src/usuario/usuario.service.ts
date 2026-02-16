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

    async create(instituicaoCodigo: number, dto: CreateUsuarioDto) {
        let usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USREmail: dto.email },
        });

        if (!usuario) {
            const senhaHash = await this.authService.hashSenha(dto.senha);
            usuario = await this.prisma.uSRUsuario.create({
                data: {
                    USRNome: dto.nome,
                    USREmail: dto.email,
                    USRSenha: senhaHash,
                },
            });
        }

        // Add auto-permission for the current institution
        const accessData = {
            USRCodigo: usuario.USRCodigo,
            grupo: GrupoAcesso.OPERACAO,
            INSInstituicaoCodigo: instituicaoCodigo,
        };

        // Use upsert-like logic to avoid duplicate access records for this institution
        const existingAccess = await this.prisma.uSRAcesso.findFirst({
            where: accessData,
        });

        if (!existingAccess) {
            await this.prisma.uSRAcesso.create({
                data: accessData,
            });
        }

        return usuario;
    }

    async findAll(instituicaoCodigo: number, query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        // Build filter conditions: All users that have access to THIS institution
        const whereConditions: any = {
            acessos: {
                some: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    // Exclude SUPER_ADMIN and SUPER_ROOT from general management
                    grupo: {
                        notIn: [GrupoAcesso.SUPER_ADMIN, GrupoAcesso.SUPER_ROOT],
                    },
                },
            },
        };

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
                            INSInstituicaoCodigo: instituicaoCodigo
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

    async findOne(instituicaoCodigo: number, id: number) {
        const usuario = await this.prisma.uSRUsuario.findFirst({
            where: {
                USRCodigo: id,
                acessos: { some: { INSInstituicaoCodigo: instituicaoCodigo } }
            },
            select: {
                USRCodigo: true,
                USRNome: true,
                USREmail: true,
                createdAt: true,
                acessos: {
                    where: { INSInstituicaoCodigo: instituicaoCodigo },
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
        if (!usuario) throw new NotFoundException(`Usuário ${id} não encontrado nesta instituição`);
        return usuario;
    }

    async update(instituicaoCodigo: number, id: number, dto: UpdateUsuarioDto) {
        await this.findOne(instituicaoCodigo, id);

        const data: any = {};
        if (dto.nome) data.USRNome = dto.nome;
        if (dto.email) data.USREmail = dto.email;
        if (dto.senha) data.USRSenha = await this.authService.hashSenha(dto.senha);

        return this.prisma.uSRUsuario.update({
            where: { USRCodigo: id },
            data,
        });
    }

    async remove(instituicaoCodigo: number, id: number) {
        const usuario = await this.findOne(instituicaoCodigo, id);

        // IMPORTANT: We should probably only remove the access to THIS institution
        // unless they have NO other accesses. But for now, let's keep it simple:
        // if deleting from instituicao context, we remove the institution access.
        // If they have no other accesses, we could delete the user, but it's safer to just remove access.

        return this.prisma.uSRAcesso.deleteMany({
            where: {
                USRCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo
            }
        });
    }

    async addAcesso(instituicaoCodigo: number, userId: number, dto: CreateAcessoDto, creatorAcessos: any[]) {
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

        // Check if user exists (even if not in this institution yet)
        const usuario = await this.prisma.uSRUsuario.findUnique({ where: { USRCodigo: userId } });
        if (!usuario) throw new NotFoundException(`Usuário ${userId} não encontrado`);

        return this.prisma.uSRAcesso.create({
            data: {
                USRCodigo: userId,
                grupo: dto.grupo,
                CLICodigo: dto.clienteId ?? null,
                INSInstituicaoCodigo: instituicaoCodigo, // Enforce current institution
            },
        });
    }

    async removeAcesso(instituicaoCodigo: number, acessoId: number) {
        const acesso = await this.prisma.uSRAcesso.findFirst({
            where: {
                UACCodigo: acessoId,
                INSInstituicaoCodigo: instituicaoCodigo
            },
        });
        if (!acesso) throw new NotFoundException(`Acesso ${acessoId} não encontrado nesta instituição`);
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
        if (dto.nome !== undefined) data.USRNome = dto.nome || null;
        if (dto.telefone !== undefined) data.USRTelefone = dto.telefone || null;
        if (dto.bio !== undefined) data.USRBio = dto.bio || null;
        if (dto.fotoUrl !== undefined) data.USRFotoUrl = dto.fotoUrl || null;
        if (dto.facebook !== undefined) data.USRFacebook = dto.facebook || null;
        if (dto.twitter !== undefined) data.USRTwitter = dto.twitter || null;
        if (dto.linkedin !== undefined) data.USRLinkedin = dto.linkedin || null;
        if (dto.instagram !== undefined) data.USRInstagram = dto.instagram || null;
        if (dto.pais !== undefined) data.USRPais = dto.pais || null;
        if (dto.cidade !== undefined) data.USRCidade = dto.cidade || null;
        if (dto.estado !== undefined) data.USREstado = dto.estado || null;
        if (dto.cep !== undefined) data.USRCep = dto.cep || null;
        if (dto.taxId !== undefined) data.USRTaxId = dto.taxId || null;

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
