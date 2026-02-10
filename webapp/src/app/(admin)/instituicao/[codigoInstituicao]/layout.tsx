"use client";

import { TenantProvider } from "@/context/TenantContext";

export default function TenantLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <TenantProvider>{children}</TenantProvider>;
}
