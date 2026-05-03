/**
 * Espelha a matriz da API (webapi/src/auth/permission-matrix.ts) para UI.
 */

export type PermissionResource =
    | "dashboard"
    | "passagem"
    | "pessoa"
    | "matricula"
    | "equipamento"
    | "usuario_instituicao"
    | "rotina"
    | "execucao"
    | "registroDiario";

export type PermissionAction =
    | "read"
    | "create"
    | "update"
    | "delete"
    | "execute"
    | "reprocess"
    | "cancel_run"
    | "proxy_http"
    | "manage_versions"
    | "clear_serial_lock";

const A = (actions: PermissionAction[]) => new Set(actions);

const RULES: Record<
    string,
    Partial<Record<PermissionResource, Set<PermissionAction>>> | undefined
> = {
    OPERACAO: {
        dashboard: A(["read"]),
        passagem: A(["read", "update"]),
        pessoa: A(["read", "update"]),
        matricula: A(["read"]),
        usuario_instituicao: A(["read"]),
        rotina: A(["read", "execute", "cancel_run"]),
        execucao: A(["read", "reprocess", "cancel_run"]),
        registroDiario: A(["read"]),
    },
    GESTOR: {
        dashboard: A(["read"]),
        passagem: A(["read"]),
        pessoa: A(["read", "update"]),
        matricula: A(["read"]),
        equipamento: A(["read"]),
        usuario_instituicao: A(["read", "create", "update", "delete"]),
        rotina: A(["read", "execute", "cancel_run"]),
        execucao: A(["read", "reprocess", "cancel_run"]),
        registroDiario: A(["read", "execute"]),
    },
    ADMIN: {
        dashboard: A(["read"]),
        passagem: A(["read", "create", "update", "delete"]),
        pessoa: A(["read", "create", "update", "delete"]),
        matricula: A(["read", "create", "update", "delete"]),
        equipamento: A(["read", "create", "update", "delete", "proxy_http"]),
        usuario_instituicao: A(["read", "create", "update", "delete"]),
        registroDiario: A(["read", "create", "update", "delete", "execute"]),
        rotina: A([
            "read",
            "create",
            "update",
            "delete",
            "execute",
            "cancel_run",
            "manage_versions",
            "clear_serial_lock",
        ]),
        execucao: A(["read", "reprocess", "delete", "cancel_run"]),
    },
    SUPER_ROOT: undefined,
    SUPER_ADMIN: undefined,
};

export function permissionAllowed(
    grupo: string | null | undefined,
    resource: PermissionResource,
    action: PermissionAction,
): boolean {
    if (!grupo) return false;
    if (grupo === "SUPER_ROOT" || grupo === "SUPER_ADMIN") return true;
    const set = RULES[grupo]?.[resource];
    return !!set?.has(action);
}
