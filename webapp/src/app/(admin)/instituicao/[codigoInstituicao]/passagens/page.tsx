"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet } from "@/lib/api";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import PassagensFiltros, {
    PASSAGEM_FILTROS_VAZIOS,
    buildPassagemListQuery,
    type PassagemFiltrosAplicados,
} from "./components/PassagensFiltros";

interface Passagem {
    REGCodigo: number;
    REGAcao: string;
    REGDataHora: string;
    pessoa: {
        PESNome: string;
        PESDocumento: string | null;
        PESFotoExtensao?: string | null;
        PESFotoThumbnailBase64?: string | null;
    };
    equipamento: { EQPDescricao: string | null };
}

function fotoDataUrl(p: Passagem["pessoa"]): string | null {
    if (!p?.PESFotoThumbnailBase64) return null;
    const ext = (p.PESFotoExtensao || "jpg").toLowerCase();
    const mime =
        ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "gif"
                ? "image/gif"
                : "image/jpeg";
    return `data:${mime};base64,${p.PESFotoThumbnailBase64}`;
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

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [filtrosAplicados, setFiltrosAplicados] = useState<PassagemFiltrosAplicados>(
        PASSAGEM_FILTROS_VAZIOS
    );
    const [gruposDisponiveis, setGruposDisponiveis] = useState<string[]>([]);
    const [opcoesFiltro, setOpcoesFiltro] = useState<{
        cursos: string[];
        series: string[];
        turmas: string[];
    }>({ cursos: [], series: [], turmas: [] });

    const load = useCallback(async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const qs = buildPassagemListQuery(page, limit, filtrosAplicados);
            const res = await apiGet<{ data: Passagem[]; meta: Meta }>(
                `/instituicao/${codigoInstituicao}/passagem?${qs}`
            );
            setPassagens(res.data || []);
            setMeta(res.meta);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, page, limit, filtrosAplicados]);

    useEffect(() => {
        load();
    }, [load]);

    const loadGrupos = useCallback(async () => {
        if (!codigoInstituicao) return;
        try {
            const list = await apiGet<string[]>(
                `/instituicao/${codigoInstituicao}/pessoa/grupos`
            );
            setGruposDisponiveis(Array.isArray(list) ? list : []);
        } catch {
            setGruposDisponiveis([]);
        }
    }, [codigoInstituicao]);

    const loadOpcoesFiltro = useCallback(async () => {
        if (!codigoInstituicao) return;
        try {
            const data = await apiGet<{
                cursos: string[];
                series: string[];
                turmas: string[];
            }>(`/instituicao/${codigoInstituicao}/matricula/opcoes-filtro`);
            setOpcoesFiltro({
                cursos: data.cursos ?? [],
                series: data.series ?? [],
                turmas: data.turmas ?? [],
            });
        } catch {
            setOpcoesFiltro({ cursos: [], series: [], turmas: [] });
        }
    }, [codigoInstituicao]);

    useEffect(() => { loadGrupos(); }, [loadGrupos]);
    useEffect(() => { loadOpcoesFiltro(); }, [loadOpcoesFiltro]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Passagens</h2>

            <PassagensFiltros
                aplicados={filtrosAplicados}
                gruposDisponiveis={gruposDisponiveis}
                cursosDisponiveis={opcoesFiltro.cursos}
                seriesDisponiveis={opcoesFiltro.series}
                turmasDisponiveis={opcoesFiltro.turmas}
                onAplicar={(f) => {
                    setFiltrosAplicados(f);
                    setPage(1);
                }}
                onLimpar={() => {
                    setFiltrosAplicados(PASSAGEM_FILTROS_VAZIOS);
                    setPage(1);
                }}
            />

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400 w-16">Foto</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Pessoa</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Documento</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ação</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Equipamento</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Data/Hora</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : passagens.length === 0 ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Nenhuma passagem encontrada.</td></tr>
                        ) : passagens.map((p) => {
                            const src = p.pessoa ? fotoDataUrl(p.pessoa) : null;
                            const initial = (p.pessoa?.PESNome || "?").trim().charAt(0).toUpperCase();
                            return (
                            <tr key={p.REGCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 align-middle">
                                    {src ? (
                                        <img
                                            src={src}
                                            alt={p.pessoa?.PESNome ? `Foto de ${p.pessoa.PESNome}` : "Foto"}
                                            width={48}
                                            height={48}
                                            className="h-12 w-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                                        />
                                    ) : (
                                        <div
                                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                            aria-hidden
                                        >
                                            {initial}
                                        </div>
                                    )}
                                </td>
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
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Registros por página:</span>
                    <select
                        value={limit}
                        onChange={(e) => {
                            setLimit(Number(e.target.value));
                            setPage(1);
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none"
                    >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>

                {meta.totalPages > 1 && (
                    <PaginationWithIcon
                        totalPages={meta.totalPages}
                        initialPage={page}
                        onPageChange={(p) => setPage(p)}
                    />
                )}

                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total: {meta.total} registros
                </p>
            </div>
        </div>
    );
}
