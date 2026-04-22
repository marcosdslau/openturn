import { ForbiddenException } from '@nestjs/common';
import { permissionAllowed, PermissionAction, PermissionResource } from './permission-matrix';
import { institutionGrupoForUser, isGlobalAcessoUser } from './institution-role.util';

export function assertInstitutionPermission(
    user: any,
    instituicaoCodigo: number,
    resource: PermissionResource,
    action: PermissionAction,
): void {
    if (!user?.acessos) {
        throw new ForbiddenException('Sem permissão de acesso');
    }
    if (isGlobalAcessoUser(user)) {
        return;
    }
    const grupo = institutionGrupoForUser(user, instituicaoCodigo);
    if (!grupo) {
        throw new ForbiddenException('Sem acesso a esta instituição');
    }
    if (!permissionAllowed(grupo, resource, action)) {
        throw new ForbiddenException('Nível de acesso insuficiente');
    }
}
