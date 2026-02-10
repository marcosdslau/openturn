"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiGet, setToken, clearToken } from "@/lib/api";

interface User {
    codigo: number;
    nome: string;
    email: string;
    grupo: string;
    clienteId: number | null;
    instituicaoId: number | null;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (email: string, senha: string) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const loadUser = useCallback(async () => {
        try {
            const token = localStorage.getItem("openturn_token");
            if (!token) {
                setLoading(false);
                return;
            }
            const data = await apiGet<any>("/auth/me");
            setUser({
                codigo: data.sub || data.codigo,
                nome: data.nome,
                email: data.email,
                grupo: data.grupo,
                clienteId: data.clienteId,
                instituicaoId: data.instituicaoId,
            });
        } catch {
            clearToken();
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUser();
    }, [loadUser]);

    const login = async (email: string, senha: string) => {
        const data = await apiPost<{ access_token: string; usuario: User }>("/auth/login", { email, senha });
        setToken(data.access_token);
        setUser(data.usuario);

        // Redirect to first institution
        let instId = data.usuario.instituicaoId;
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

        router.push(instId ? `/instituicao/${instId}/dashboard` : "/");
    };

    const logout = () => {
        clearToken();
        setUser(null);
        router.push("/signin");
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
