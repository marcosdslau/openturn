import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'openturn_super_secret_key',
        });
    }

    validate(payload: JwtPayload) {
        return {
            userId: payload.sub,
            email: payload.email,
            nome: payload.nome,
            grupo: payload.grupo,
            clienteId: payload.clienteId,
            instituicaoId: payload.instituicaoId,
        };
    }
}
