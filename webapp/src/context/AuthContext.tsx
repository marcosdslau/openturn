"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiGet, setToken, clearToken, UnauthorizedError } from "@/lib/api";
import { firstAccessibleInstituicaoId } from "@/lib/user-instituicao-access";

interface AcessoScope {
    grupo: string;
    clienteId: number | null;
    clienteNome?: string | null;
    instituicaoId: number | null;
    instituicaoNome?: string | null;
}

interface User {
    codigo: number;
    nome: string;
    email: string;
    acessos: AcessoScope[];
    activeScope: AcessoScope | null;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    authError: boolean;
    login: (email: string, senha: string) => Promise<void>;
    logout: () => void;
    switchContext: (clienteId?: number, instituicaoId?: number) => Promise<void>;
    isAuthenticated: boolean;
    isGlobal: boolean;
    isSuperRoot: boolean;
    isAdmin: boolean;
    retryLoadUser: () => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Backoff curto para falhas transitórias (rede, 5xx, timeout) ao carregar a sessão.
// Não usado para 401 real, que é tratado como logout imediato.
const LOAD_USER_RETRY_DELAYS_MS = [1000, 3000];

const ACTIVE_SCOPE_KEY = "openturn_active_scope";

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(false);
    const router = useRouter();

    const loadUser = useCallback(async () => {
        const token = localStorage.getItem("openturn_token");
        if (!token) {
            setLoading(false);
            return;
        }

        setAuthError(false);

        // UnauthorizedError (401 real) = sessão inválida -> logout imediato.
        // Qualquer outro erro (rede, timeout, 5xx, banco indisponível) é tratado como
        // falha transitória: algumas tentativas com backoff, sem apagar a sessão.
        for (let attempt = 0; attempt <= LOAD_USER_RETRY_DELAYS_MS.length; attempt++) {
            try {
                const data = await apiGet<any>("/auth/me");

                const savedScope = localStorage.getItem(ACTIVE_SCOPE_KEY);
                const activeScope = savedScope ? JSON.parse(savedScope) : data.activeScope;

                setUser({
                    codigo: data.userId || data.sub || data.codigo,
                    nome: data.nome,
                    email: data.email,
                    acessos: data.acessos || [],
                    activeScope,
                });
                setAuthError(false);
                setLoading(false);
                return;
            } catch (err) {
                if (err instanceof UnauthorizedError) {
                    clearToken();
                    localStorage.removeItem(ACTIVE_SCOPE_KEY);
                    setUser(null);
                    setLoading(false);
                    return;
                }

                const isLastAttempt = attempt === LOAD_USER_RETRY_DELAYS_MS.length;
                if (isLastAttempt) {
                    // Falha de infraestrutura persistente: mantém o token/sessão atual
                    // (não desloga o usuário) e apenas sinaliza o erro para a UI.
                    setAuthError(true);
                    setLoading(false);
                    return;
                }

                await sleep(LOAD_USER_RETRY_DELAYS_MS[attempt]);
            }
        }
    }, []);

    const retryLoadUser = useCallback(() => {
        setLoading(true);
        loadUser();
    }, [loadUser]);

    useEffect(() => {
        loadUser();
    }, [loadUser]);

    const login = async (email: string, senha: string) => {
        const data = await apiPost<{ access_token: string; usuario: User }>("/auth/login", { email, senha });
        setToken(data.access_token);

        const activeScope = data.usuario.activeScope;
        if (activeScope) {
            localStorage.setItem(ACTIVE_SCOPE_KEY, JSON.stringify(activeScope));
        }

        setUser(data.usuario);

        // Redirect: prioritize activeScope > localStorage > first available institution
        let instId = activeScope?.instituicaoId;
        if (!instId) {
            const saved = localStorage.getItem("sg_last_inst");
            if (saved && saved !== "0") {
                instId = Number(saved);
            }
        }
        if (!instId) {
            instId = firstAccessibleInstituicaoId(data.usuario.acessos);
        }
        if (!instId) {
            try {
                const instList = await apiGet<{ data: any[] }>("/instituicoes?limit=1");
                if (instList.data?.length > 0) {
                    instId = instList.data[0].INSCodigo;
                }
            } catch {
                // fallback
            }
        }
        if (instId) {
            localStorage.setItem("sg_last_inst", String(instId));
        }

        router.push(instId ? `/instituicao/${instId}/dashboard` : "/");
    };

    const switchContext = async (clienteId?: number, instituicaoId?: number) => {
        const data = await apiPost<{ access_token: string; activeScope: AcessoScope }>(
            "/auth/switch-context",
            { clienteId, instituicaoId }
        );
        setToken(data.access_token);
        localStorage.setItem(ACTIVE_SCOPE_KEY, JSON.stringify(data.activeScope));

        if (user) {
            setUser({ ...user, activeScope: data.activeScope });
        }
    };

    const logout = () => {
        clearToken();
        localStorage.removeItem(ACTIVE_SCOPE_KEY);
        setUser(null);
        router.push("/signin");
    };

    const isGlobal = user?.acessos?.some(
        (a) => a.grupo === "SUPER_ROOT" || a.grupo === "SUPER_ADMIN"
    ) ?? false;

    const isSuperRoot = user?.acessos?.some((a) => a.grupo === "SUPER_ROOT") ?? false;
    const isAdmin = user?.acessos?.some((a) => a.grupo === "SUPER_ADMIN") ?? false;

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            authError,
            login,
            logout,
            switchContext,
            isAuthenticated: !!user,
            isGlobal,
            isSuperRoot,
            isAdmin,
            retryLoadUser
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
