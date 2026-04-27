import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GrupoAcesso } from '@prisma/client';
import { PERMISSION_KEY, PermissionSpec } from './permissions.decorator';
import { permissionAllowed } from './permission-matrix';
import {
  institutionGrupoForUser,
  isGlobalAcessoUser,
  parseInstituicaoCodigoFromRequest,
} from './institution-role.util';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const spec = this.reflector.getAllAndOverride<PermissionSpec>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!spec) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.acessos) {
      throw new ForbiddenException('Sem permissão de acesso');
    }

    if (isGlobalAcessoUser(user)) {
      return true;
    }

    const instId = parseInstituicaoCodigoFromRequest(request.params || {});
    if (instId === null) {
      throw new ForbiddenException('Instituição não identificada na rota');
    }

    const grupo = institutionGrupoForUser(user, instId);
    if (!grupo) {
      throw new ForbiddenException('Sem acesso a esta instituição');
    }

    if (!permissionAllowed(grupo, spec.resource, spec.action)) {
      throw new ForbiddenException('Nível de acesso insuficiente');
    }

    return true;
  }
}
