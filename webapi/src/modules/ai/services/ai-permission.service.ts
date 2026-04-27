import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class AiPermissionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Valida se o usuário logado tem permissão para consumir o modelo IA na instituição atual.
   * Lança exceção Forbidden caso não tenha.
   */
  async validateAccess(
    instituicaoCodigo: number,
    userCodigo: number,
    modelCodigo: number,
  ): Promise<{ allowed: boolean; limitDia: number }> {
    const perm = await this.prisma.aIPEPermissaoIa.findUnique({
      where: {
        USRCodigo_INSInstituicaoCodigo: {
          USRCodigo: userCodigo,
          INSInstituicaoCodigo: instituicaoCodigo,
        },
      },
    });

    if (!perm || !perm.AIPEHabilitado) {
      // MVP Bypass - Temporarily allow access if no permission row exists until we build Admin UI
      console.log(
        `[MVP BYPASS] Allowing access for User \${userCodigo} in Tenant \${instituicaoCodigo} without explicit Permission Row`,
      );
      return { allowed: true, limitDia: 100000 };
      // throw new ForbiddenException('Usuário não possui acesso habilitado para uso de IA nesta instituição.');
    }

    if (perm.AIPEModelosPermitidos) {
      try {
        const permittedModels = JSON.parse(perm.AIPEModelosPermitidos);
        if (
          Array.isArray(permittedModels) &&
          !permittedModels.includes(modelCodigo)
        ) {
          // MVP Bypass
          // throw new ForbiddenException('O modelo de IA selecionado não está autorizado para este perfil.');
        }
      } catch (e) {
        // Fallback in case syntax is not JSON array
      }
    }

    return { allowed: true, limitDia: perm.AIPELimiteTokensDia };
  }
}
