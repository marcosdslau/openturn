import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUsuarioDto, UpdateUsuarioDto, CreateAcessoDto } from './dto/usuario.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { GrupoAcesso } from '@prisma/client';

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

    async findAll(query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.uSRUsuario.findMany({
                skip,
                take: limit,
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
                orderBy: { USRCodigo: 'desc' },
            }),
            this.prisma.uSRUsuario.count(),
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
}
