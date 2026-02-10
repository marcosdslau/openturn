"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet } from "@/lib/api";

interface DashboardStats {
    entradas: number;
    saidas: number;
    presentes: number;
}

interface Passagem {
    REGCodigo: number;
    REGAcao: string;
    REGDataHora: string;
    pessoa: { PESNome: string; PESDocumento: string | null };
    equipamento: { EQPDescricao: string | null };
}

export default function DashboardPage() {
    const { codigoInstituicao, instituicao } = useTenant();
    const [stats, setStats] = useState<DashboardStats>({ entradas: 0, saidas: 0, presentes: 0 });
    const [recentes, setRecentes] = useState<Passagem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const today = new Date().toISOString().split("T")[0];
            const res = await apiGet<{ data: Passagem[]; meta: { total: number } }>(
                `/passagens?limit=50&dataInicio=${today}`
            );

            const passagens = res.data || [];
            const entradas = passagens.filter((p) => p.REGAcao === "ENTRADA").length;
            const saidas = passagens.filter((p) => p.REGAcao === "SAIDA").length;

            setStats({ entradas, saidas, presentes: Math.max(0, entradas - saidas) });
            setRecentes(passagens.slice(0, 10));
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao]);

    useEffect(() => {
        load();
        const interval = setInterval(load, 10000); // Polling 10s
        return () => clearInterval(interval);
    }, [load]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                    Dashboard
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {instituicao?.INSNome || `Instituição ${codigoInstituicao}`}
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Entradas Hoje"
                    value={stats.entradas}
                    color="text-green-600 dark:text-green-400"
                    bg="bg-green-50 dark:bg-green-900/20"
                    icon="↗"
                />
                <StatCard
                    title="Saídas Hoje"
                    value={stats.saidas}
                    color="text-red-600 dark:text-red-400"
                    bg="bg-red-50 dark:bg-red-900/20"
                    icon="↙"
                />
                <StatCard
                    title="Presentes Agora"
                    value={stats.presentes}
                    color="text-blue-600 dark:text-blue-400"
                    bg="bg-blue-50 dark:bg-blue-900/20"
                    icon="●"
                />
            </div>

            {/* Recent Passages */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Últimas Passagens
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Atualização automática a cada 10s</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Pessoa</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ação</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Equipamento</th>
                                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                                        Carregando...
                                    </td>
                                </tr>
                            ) : recentes.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                                        Nenhuma passagem registrada hoje.
                                    </td>
                                </tr>
                            ) : (
                                recentes.map((p) => (
                                    <tr key={p.REGCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">
                                            {p.pessoa?.PESNome || "—"}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.REGAcao === "ENTRADA"
                                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                }`}>
                                                {p.REGAcao === "ENTRADA" ? "↗ Entrada" : "↙ Saída"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            {p.equipamento?.EQPDescricao || "—"}
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(p.REGDataHora).toLocaleTimeString("pt-BR")}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, color, bg, icon }: {
    title: string; value: number; color: string; bg: string; icon: string;
}) {
    return (
        <div className={`rounded-2xl border border-gray-200 p-5 dark:border-gray-800 ${bg}`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                    <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
                </div>
                <span className={`text-2xl ${color}`}>{icon}</span>
            </div>
        </div>
    );
}
