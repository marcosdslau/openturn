import {
    Injectable,
    UnauthorizedException,
    ForbiddenException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { BrevoMailService } from './brevo-mail.service';

export const FORGOT_PASSWORD_GENERIC_MESSAGE =
    'Se existir uma conta com este e-mail, você receberá um link para redefinir a senha.';

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
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private brevoMail: BrevoMailService,
    ) { }

    private hashPasswordResetToken(rawToken: string): string {
        return createHash('sha256').update(rawToken, 'utf8').digest('hex');
    }

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

    /** 1 hora */
    private static readonly PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

    async forgotPassword(email: string) {
        const generic = { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
        const normalized = email.trim();
        if (!normalized) {
            return generic;
        }

        const usuario = await this.prisma.uSRUsuario.findFirst({
            where: { USREmail: { equals: normalized, mode: 'insensitive' } },
        });

        if (!usuario || !usuario.USRAtivo) {
            return generic;
        }

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashPasswordResetToken(rawToken);
        const expiresAt = new Date(Date.now() + AuthService.PASSWORD_RESET_TTL_MS);

        await this.prisma.$transaction(async (tx) => {
            await tx.uSRSenhaResetToken.deleteMany({ where: { USRCodigo: usuario.USRCodigo } });
            await tx.uSRSenhaResetToken.create({
                data: {
                    USRCodigo: usuario.USRCodigo,
                    USRTokenHash: tokenHash,
                    USRTokenExpiresAt: expiresAt,
                },
            });
        });

        const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
        if (!appUrl) {
            this.logger.error('APP_URL não configurada; e-mail de reset não enviado');
            return generic;
        }

        const resetUrl = `${appUrl}/reset-password/confirm?token=${encodeURIComponent(rawToken)}`;

        try {
            await this.brevoMail.sendPasswordResetEmail(usuario.USREmail, resetUrl);
        } catch (e) {
            this.logger.error('Erro ao enviar e-mail de recuperação de senha', e);
        }

        return generic;
    }

    async resetPasswordWithToken(dto: ResetPasswordDto) {
        const raw = dto.token.trim();
        if (!raw) {
            throw new BadRequestException('Link inválido ou expirado. Solicite um novo e-mail.');
        }

        const tokenHash = this.hashPasswordResetToken(raw);
        const record = await this.prisma.uSRSenhaResetToken.findUnique({
            where: { USRTokenHash: tokenHash },
            include: { usuario: true },
        });

        if (!record) {
            throw new BadRequestException('Link inválido ou expirado. Solicite um novo e-mail.');
        }

        if (record.USRTokenExpiresAt < new Date()) {
            await this.prisma.uSRSenhaResetToken.deleteMany({
                where: { USRCodigo: record.usuario.USRCodigo },
            });
            throw new BadRequestException('Link inválido ou expirado. Solicite um novo e-mail.');
        }

        if (!record.usuario.USRAtivo) {
            throw new BadRequestException('Conta inativa. Entre em contato com o suporte.');
        }

        const senhaHash = await this.hashSenha(dto.novaSenha);

        await this.prisma.$transaction([
            this.prisma.uSRUsuario.update({
                where: { USRCodigo: record.usuario.USRCodigo },
                data: { USRSenha: senhaHash },
            }),
            this.prisma.uSRSenhaResetToken.deleteMany({
                where: { USRCodigo: record.usuario.USRCodigo },
            }),
        ]);

        return { message: 'Senha redefinida com sucesso. Você já pode entrar.' };
    }
}
