"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { getMainNavItems, type NavItem } from "@/layout/menu-data";

export function useMainNavItems(): NavItem[] {
    const params = useParams();
    const { isSuperRoot, isAdmin, isGlobal } = useAuth();
    const { grupoNoContexto } = useTenant();
    const [lastInst, setLastInst] = useState("0");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem("sg_last_inst");
        if (stored) setLastInst(stored);
    }, []);

    const paramCode = params?.codigoInstituicao as string;
    const code = paramCode || (mounted ? lastInst : "0");
    const base = `/instituicao/${code}`;

    return useMemo(
        () =>
            getMainNavItems(base, isSuperRoot, isAdmin, {
                grupoInstituicao: grupoNoContexto,
                isGlobalUser: isGlobal,
            }),
        [base, isSuperRoot, isAdmin, grupoNoContexto, isGlobal],
    );
}
