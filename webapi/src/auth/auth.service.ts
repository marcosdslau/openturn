import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SwitchContextDto } from './dto/switch-context.dto';

export interface AcessoScope {
    grupo: string;
    clienteId: number | null;
    clienteNome?: string | null;
    instituicaoId: number | null;
    instituicaoNome?: string | null;
}

export interface JwtPayload {
    sub: number;
    email: string;
    nome: string;
    acessos: AcessoScope[];
    activeScope: AcessoScope | null;
}

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async login(dto: LoginDto) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USREmail: dto.email },
            include: {
                acessos: {
                    include: { cliente: true, instituicao: true },
                },
            },
        });

        if (!usuario) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        const senhaValida = await bcrypt.compare(dto.senha, usuario.USRSenha);
        if (!senhaValida) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        const acessos: AcessoScope[] = usuario.acessos.map((a) => ({
            grupo: a.grupo,
            clienteId: a.CLICodigo,
            clienteNome: a.cliente?.CLINome,
            instituicaoId: a.INSInstituicaoCodigo,
            instituicaoNome: a.instituicao?.INSNome,
        }));

        // Default: first scope as active
        const activeScope = acessos.length > 0 ? acessos[0] : null;

        const payload: JwtPayload = {
            sub: usuario.USRCodigo,
            email: usuario.USREmail,
            nome: usuario.USRNome,
            acessos,
            activeScope,
        };

        return {
            access_token: this.jwtService.sign(payload),
            usuario: {
                codigo: usuario.USRCodigo,
                nome: usuario.USRNome,
                email: usuario.USREmail,
                acessos,
                activeScope,
            },
        };
    }

    async switchContext(userId: number, dto: SwitchContextDto) {
        const usuario = await this.prisma.uSRUsuario.findUnique({
            where: { USRCodigo: userId },
            include: {
                acessos: {
                    include: { cliente: true, instituicao: true },
                },
            },
        });

        if (!usuario) {
            throw new UnauthorizedException('Usuário não encontrado');
        }

        const acessos: AcessoScope[] = usuario.acessos.map((a) => ({
            grupo: a.grupo,
            clienteId: a.CLICodigo,
            clienteNome: a.cliente?.CLINome,
            instituicaoId: a.INSInstituicaoCodigo,
            instituicaoNome: a.instituicao?.INSNome,
        }));

        // Check if user is global (SUPER_ROOT or SUPER_ADMIN)
        const isGlobal = acessos.some(
            (a) => a.grupo === 'SUPER_ROOT' || a.grupo === 'SUPER_ADMIN',
        );

        let activeScope: AcessoScope | null = null;

        if (isGlobal) {
            // Global users can switch to any context
            const globalAccess = acessos.find(
                (a) => a.grupo === 'SUPER_ROOT' || a.grupo === 'SUPER_ADMIN',
            );

            // If switching to a specific context, try to fetch names for descriptors
            let clienteNome: string | null = null;
            let instituicaoNome: string | null = null;

            if (dto.instituicaoId) {
                const inst = await this.prisma.iNSInstituicao.findUnique({
                    where: { INSCodigo: dto.instituicaoId },
                    include: { cliente: true },
                });
                if (inst) {
                    instituicaoNome = inst.INSNome;
                    clienteNome = inst.cliente.CLINome;
                }
            } else if (dto.clienteId) {
                const cli = await this.prisma.cLICliente.findUnique({
                    where: { CLICodigo: dto.clienteId },
                });
                if (cli) clienteNome = cli.CLINome;
            }

            activeScope = {
                grupo: globalAccess!.grupo,
                clienteId: dto.clienteId ?? null,
                clienteNome,
                instituicaoId: dto.instituicaoId ?? null,
                instituicaoNome,
            };
        } else {
            // Scoped users: validate the requested context exists in their acessos
            activeScope = acessos.find((a) => {
                if (dto.instituicaoId && a.instituicaoId === dto.instituicaoId) return true;
                if (dto.clienteId && a.clienteId === dto.clienteId && !dto.instituicaoId) return true;
                return false;
            }) ?? null;

            if (!activeScope) {
                throw new ForbiddenException('Sem permissão para este contexto');
            }
        }

        const payload: JwtPayload = {
            sub: usuario.USRCodigo,
            email: usuario.USREmail,
            nome: usuario.USRNome,
            acessos,
            activeScope,
        };

        return {
            access_token: this.jwtService.sign(payload),
            activeScope,
        };
    }

    async hashSenha(senha: string): Promise<string> {
        return bcrypt.hash(senha, 10);
    }
}
