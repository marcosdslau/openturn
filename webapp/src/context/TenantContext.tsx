"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { buildInstituicoesListFromAcessos } from "@/lib/user-instituicao-access";
import { useAuth } from "./AuthContext";

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
    grupoNoContexto: string | null;
}

const TenantContext = createContext<TenantContextType>({} as TenantContextType);

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const params = useParams();
    const router = useRouter();
    const { user, switchContext, isGlobal } = useAuth();
    const codigoInstituicao = Number(params.codigoInstituicao);

    const [instituicao, setInstituicao] = useState<Instituicao | null>(null);
    const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!codigoInstituicao) return;
        if (!isGlobal && !user) return;

        const load = async () => {
            try {
                if (isGlobal) {
                    const [inst, list] = await Promise.all([
                        apiGet<Instituicao>(`/instituicoes/${codigoInstituicao}`),
                        apiGet<{ data: Instituicao[] }>("/instituicoes?limit=100"),
                    ]);
                    setInstituicao(inst);
                    setInstituicoes(list.data || []);
                } else if (user) {
                    const scoped = buildInstituicoesListFromAcessos(user.acessos);
                    setInstituicoes(scoped);
                    const cur =
                        scoped.find((i) => i.INSCodigo === codigoInstituicao) ??
                        null;
                    if (cur) {
                        setInstituicao(cur);
                    } else {
                        const a = user.acessos.find(
                            (x) => x.instituicaoId === codigoInstituicao,
                        );
                        setInstituicao({
                            INSCodigo: codigoInstituicao,
                            INSNome:
                                (a?.instituicaoNome && a.instituicaoNome.trim()) ||
                                `Instituição ${codigoInstituicao}`,
                            INSAtivo: true,
                            CLICodigo: a?.clienteId ?? 0,
                        });
                    }
                }

                const saved = localStorage.getItem("sg_last_inst");
                if (!saved || saved === "0") {
                    localStorage.setItem("sg_last_inst", String(codigoInstituicao));
                }
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [codigoInstituicao, isGlobal, user]);

    const switchInstituicao = async (codigo: number) => {
        localStorage.setItem("sg_last_inst", String(codigo));
        await switchContext(undefined, codigo);
        router.push(`/instituicao/${codigo}/dashboard`);
    };

    // Determine the user's role in the current institution context
    const grupoNoContexto = (() => {
        if (!user) return null;
        if (isGlobal) {
            return user.acessos.find((a) => a.grupo === "SUPER_ROOT" || a.grupo === "SUPER_ADMIN")?.grupo ?? null;
        }
        const match = user.acessos.find((a) => a.instituicaoId === codigoInstituicao);
        return match?.grupo ?? null;
    })();

    return (
        <TenantContext.Provider
            value={{ codigoInstituicao, instituicao, instituicoes, loading, switchInstituicao, grupoNoContexto }}
        >
            {children}
        </TenantContext.Provider>
    );
}

export const useTenant = () => useContext(TenantContext);
