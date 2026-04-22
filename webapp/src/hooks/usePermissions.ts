"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import {
    permissionAllowed,
    type PermissionAction,
    type PermissionResource,
} from "@/lib/permissions";

export function usePermissions() {
    const { isGlobal } = useAuth();
    const { grupoNoContexto } = useTenant();

    const can = useMemo(() => {
        return (resource: PermissionResource, action: PermissionAction): boolean => {
            if (isGlobal) return true;
            return permissionAllowed(grupoNoContexto, resource, action);
        };
    }, [isGlobal, grupoNoContexto]);

    return { can, grupoNoContexto, isGlobal };
}
