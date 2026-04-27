import { GrupoAcesso } from '@prisma/client';

/** Recursos alinhados ao mapa de permissões (docs/mapa de permissões.md). */
export type PermissionResource =
  | 'dashboard'
  | 'passagem'
  | 'pessoa'
  | 'matricula'
  | 'equipamento'
  | 'usuario_instituicao'
  | 'rotina'
  | 'execucao';

export type PermissionAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'execute'
  | 'reprocess'
  | 'cancel_run'
  | 'proxy_http'
  | 'manage_versions'
  | 'clear_serial_lock';

const A = (actions: PermissionAction[]) => new Set(actions);

const RULES: Record<
  GrupoAcesso,
  Partial<Record<PermissionResource, Set<PermissionAction>>> | undefined
> = {
  [GrupoAcesso.OPERACAO]: {
    dashboard: A(['read']),
    passagem: A(['read', 'update']),
    pessoa: A(['read', 'update']),
    matricula: A(['read']),
    usuario_instituicao: A(['read']),
    rotina: A(['read', 'execute', 'cancel_run']),
    execucao: A(['read', 'reprocess', 'cancel_run']),
  },
  [GrupoAcesso.GESTOR]: {
    dashboard: A(['read']),
    passagem: A(['read']),
    pessoa: A(['read', 'update']),
    matricula: A(['read']),
    equipamento: A(['read']),
    usuario_instituicao: A(['read', 'create', 'update', 'delete']),
    rotina: A(['read', 'execute', 'cancel_run']),
    execucao: A(['read', 'reprocess', 'cancel_run']),
  },
  [GrupoAcesso.ADMIN]: {
    dashboard: A(['read']),
    passagem: A(['read', 'create', 'update', 'delete']),
    pessoa: A(['read', 'create', 'update', 'delete']),
    matricula: A(['read', 'create', 'update', 'delete']),
    equipamento: A(['read', 'create', 'update', 'delete', 'proxy_http']),
    usuario_instituicao: A(['read', 'create', 'update', 'delete']),
    rotina: A([
      'read',
      'create',
      'update',
      'delete',
      'execute',
      'cancel_run',
      'manage_versions',
      'clear_serial_lock',
    ]),
    execucao: A(['read', 'reprocess', 'delete', 'cancel_run']),
  },
  [GrupoAcesso.SUPER_ROOT]: undefined,
  [GrupoAcesso.SUPER_ADMIN]: undefined,
};

export function permissionAllowed(
  grupo: GrupoAcesso | string,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  if (grupo === GrupoAcesso.SUPER_ROOT || grupo === GrupoAcesso.SUPER_ADMIN) {
    return true;
  }
  const set = RULES[grupo as GrupoAcesso]?.[resource];
  return !!set?.has(action);
}
