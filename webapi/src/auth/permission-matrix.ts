import { GrupoAcesso } from '@prisma/client';

/** Recursos alinhados ao mapa de permissões (docs/mapa de permissões.md). */
export type PermissionResource =
  | 'dashboard'
  | 'passagem'
  | 'pessoa'
  | 'matricula'
  | 'equipamento'
  | 'usuario_instituicao'
  | 'notificacao'
  | 'rotina'
  | 'execucao'
  | 'registroDiario'
  | 'visitante';

export type PermissionAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'sync'
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
    pessoa: A(['read', 'update', 'sync']),
    matricula: A(['read']),
    usuario_instituicao: A(['read']),
    notificacao: A(['read', 'update']),
    rotina: A(['read', 'execute', 'cancel_run']),
    execucao: A(['read', 'reprocess', 'cancel_run']),
    registroDiario: A(['read']),
    visitante: A(['read', 'execute']),
  },
  [GrupoAcesso.GESTOR]: {
    dashboard: A(['read']),
    passagem: A(['read']),
    pessoa: A(['read', 'update', 'sync']),
    matricula: A(['read']),
    equipamento: A(['read']),
    usuario_instituicao: A(['read', 'create', 'update', 'delete']),
    notificacao: A(['read', 'update']),
    rotina: A(['read', 'execute', 'cancel_run']),
    execucao: A(['read', 'reprocess', 'cancel_run']),
    registroDiario: A(['read', 'execute']),
    visitante: A(['read', 'execute']),
  },
  [GrupoAcesso.ADMIN]: {
    dashboard: A(['read']),
    passagem: A(['read', 'create', 'update', 'delete']),
    pessoa: A(['read', 'create', 'update', 'delete', 'sync']),
    matricula: A(['read', 'create', 'update', 'delete']),
    equipamento: A(['read', 'create', 'update', 'delete', 'proxy_http']),
    usuario_instituicao: A(['read', 'create', 'update', 'delete']),
    notificacao: A(['read', 'update']),
    registroDiario: A(['read', 'create', 'update', 'delete', 'execute']),
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
    visitante: A(['read', 'execute']),
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
