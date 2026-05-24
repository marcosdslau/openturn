import type { PermissionAction, PermissionResource } from "@/lib/permissions";

type CanFn = (resource: PermissionResource, action: PermissionAction) => boolean;

export function canExecuteRegistroDiario(can: CanFn): boolean {
    return can("registroDiario", "execute");
}

export function canWriteRegistroDiario(can: CanFn): boolean {
    return can("registroDiario", "create");
}
