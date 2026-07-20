import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

export type WizardEtapa = 'EMAIL_OK' | 'OTP_OK';

export const WIZARD_ETAPA_KEY = 'wizardEtapa';
export const WizardEtapaRequired = (etapa: WizardEtapa) =>
  SetMetadata(WIZARD_ETAPA_KEY, etapa);

export interface WizardTokenPayload {
  pesCodigo: number;
  instituicaoCodigo: number;
  etapa: WizardEtapa;
}

@Injectable()
export class WizardTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<WizardEtapa>(
      WIZARD_ETAPA_KEY,
      context.getHandler(),
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Wizard token ausente.');
    }

    const token = authHeader.slice(7);
    let payload: WizardTokenPayload;

    try {
      payload = this.jwtService.verify<WizardTokenPayload>(token, {
        secret: process.env.JWT_SECRET || 'openturn_super_secret_key',
      });
    } catch {
      throw new UnauthorizedException('Wizard token inválido ou expirado.');
    }

    if (payload.etapa !== required) {
      throw new UnauthorizedException(
        `Etapa inválida: esperado "${required}", recebido "${payload.etapa}".`,
      );
    }

    request.wizardPayload = payload;
    return true;
  }
}
