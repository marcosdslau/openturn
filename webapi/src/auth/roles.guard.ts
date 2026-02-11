import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GrupoAcesso } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

const GLOBAL_ROLES: string[] = [GrupoAcesso.SUPER_ROOT, GrupoAcesso.SUPER_ADMIN];

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<GrupoAcesso[]>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const { user } = context.switchToHttp().getRequest();

        if (!user?.acessos) {
            throw new ForbiddenException('Sem permissão de acesso');
        }

        // Global roles bypass
        const hasGlobalRole = user.acessos.some((a: any) => GLOBAL_ROLES.includes(a.grupo));
        if (hasGlobalRole) {
            return true;
        }

        // Check if any of the user's scopes match the required roles
        const hasRole = user.acessos.some((a: any) => requiredRoles.includes(a.grupo));
        if (!hasRole) {
            throw new ForbiddenException('Nível de acesso insuficiente');
        }

        return true;
    }
}
