"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";

interface Instituicao {
    INSCodigo: number;
    INSNome: string;
    INSAtivo: boolean;
    CLICodigo: number;
}

interface TenantContextType {
    codigoInstituicao: number;
    instituicao: Instituicao | null;
    instituicoes: Instituicao[];
    loading: boolean;
    switchInstituicao: (codigo: number) => void;
}

const TenantContext = createContext<TenantContextType>({} as TenantContextType);

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const params = useParams();
    const router = useRouter();
    const codigoInstituicao = Number(params.codigoInstituicao);

    const [instituicao, setInstituicao] = useState<Instituicao | null>(null);
    const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!codigoInstituicao) return;

        const load = async () => {
            try {
                const [inst, list] = await Promise.all([
                    apiGet<Instituicao>(`/instituicoes/${codigoInstituicao}`),
                    apiGet<{ data: Instituicao[] }>("/instituicoes?limit=100"),
                ]);
                setInstituicao(inst);
                setInstituicoes(list.data || []);
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [codigoInstituicao]);

    const switchInstituicao = (codigo: number) => {
        router.push(`/instituicao/${codigo}/dashboard`);
    };

    return (
        <TenantContext.Provider
            value={{ codigoInstituicao, instituicao, instituicoes, loading, switchInstituicao }}
        >
            {children}
        </TenantContext.Provider>
    );
}

export const useTenant = () => useContext(TenantContext);
