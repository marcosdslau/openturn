import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
    sub: number;
    email: string;
    nome: string;
    grupo: string;
    clienteId: number | null;
    instituicaoId: number | null;
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
        });

        if (!usuario) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        const senhaValida = await bcrypt.compare(dto.senha, usuario.USRSenha);
        if (!senhaValida) {
            throw new UnauthorizedException('Credenciais inválidas');
        }

        const payload: JwtPayload = {
            sub: usuario.USRCodigo,
            email: usuario.USREmail,
            nome: usuario.USRNome,
            grupo: usuario.USRGrupo,
            clienteId: usuario.CLICodigo,
            instituicaoId: usuario.INSCodigo,
        };

        return {
            access_token: this.jwtService.sign(payload),
            usuario: {
                codigo: usuario.USRCodigo,
                nome: usuario.USRNome,
                email: usuario.USREmail,
                grupo: usuario.USRGrupo,
                clienteId: usuario.CLICodigo,
                instituicaoId: usuario.INSCodigo,
            },
        };
    }

    async hashSenha(senha: string): Promise<string> {
        return bcrypt.hash(senha, 10);
    }
}
