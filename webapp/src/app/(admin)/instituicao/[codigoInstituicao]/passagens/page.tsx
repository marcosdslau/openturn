"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet } from "@/lib/api";
import Button from "@/components/ui/button/Button";

interface Passagem {
    REGCodigo: number;
    REGAcao: string;
    REGDataHora: string;
    pessoa: { PESNome: string; PESDocumento: string | null };
    equipamento: { EQPDescricao: string | null };
}

interface Meta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export default function PassagensPage() {
    const { codigoInstituicao } = useTenant();
    const [passagens, setPassagens] = useState<Passagem[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState("");
    const [acao, setAcao] = useState("");
    const [dataInicio, setDataInicio] = useState("");
    const [dataFim, setDataFim] = useState("");
    const [page, setPage] = useState(1);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("limit", "20");
            if (acao) params.set("REGAcao", acao);
            if (dataInicio) params.set("dataInicio", dataInicio);
            if (dataFim) params.set("dataFim", dataFim);

            const res = await apiGet<{ data: Passagem[]; meta: Meta }>(`/instituicao/${codigoInstituicao}/passagem?${params}`);
            let data = res.data || [];

            // Client-side search by name/document
            if (search) {
                const s = search.toLowerCase();
                data = data.filter(
                    (p) =>
                        p.pessoa?.PESNome?.toLowerCase().includes(s) ||
                        p.pessoa?.PESDocumento?.toLowerCase().includes(s)
                );
            }

            setPassagens(data);
            setMeta(res.meta);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, page, acao, dataInicio, dataFim, search]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Passagens</h2>

            {/* Filters */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <input
                    type="text"
                    placeholder="Buscar por nome/documento..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <select
                    value={acao}
                    onChange={(e) => { setAcao(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                    <option value="">Todas as ações</option>
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                </select>
                <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <Button size="sm" onClick={() => { setSearch(""); setAcao(""); setDataInicio(""); setDataFim(""); setPage(1); }}>
                    Limpar
                </Button>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Pessoa</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Documento</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ação</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Equipamento</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Data/Hora</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : passagens.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhuma passagem encontrada.</td></tr>
                        ) : passagens.map((p) => (
                            <tr key={p.REGCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{p.pessoa?.PESNome || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.pessoa?.PESDocumento || "—"}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.REGAcao === "ENTRADA"
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                        }`}>
                                        {p.REGAcao === "ENTRADA" ? "Entrada" : "Saída"}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.equipamento?.EQPDescricao || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(p.REGDataHora).toLocaleString("pt-BR")}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Página {meta.page} de {meta.totalPages} ({meta.total} registros)
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                            Anterior
                        </Button>
                        <Button size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
                            Próxima
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
