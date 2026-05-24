"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet, apiPost } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import { useToast } from "@/context/ToastContext";
import RegistrosFiltros, { REGISTROS_FILTROS_VAZIOS, buildRegistrosQuery, type RegistrosFiltrosAplicados } from "./components/RegistrosFiltros";
import AdminLancamentoModal from "./components/AdminLancamentoModal";
import PassagensDiaModal from "./components/PassagensDiaModal";
import ReprocessarPeriodoModal from "./components/ReprocessarPeriodoModal";
import RegistrosManutencaoModal from "./components/RegistrosManutencaoModal";
import RegistroDiarioEditModal from "./components/RegistroDiarioEditModal";
import ConfirmDeleteRegistroModal from "./components/ConfirmDeleteRegistroModal";
import { canExecuteRegistroDiario, canWriteRegistroDiario } from "@/lib/registro-diario-access";

interface RegistroDiario {
    RPDCodigo: number;
    RPDData: string;
    RPDDataEntrada: string | null;
    RPDDataSaida: string | null;
    RPDStatus: "ENVIADO" | "ERRO" | "MANUAL" | "PENDENTE";
    RPDJanelaIndice: number;
    pessoa: {
        PESCodigo: number;
        PESNome: string;
        PESNomeSocial: string | null;
        PESDocumento: string | null;
        PESGrupo: string | null;
        PESFotoExtensao?: string | null;
        PESFotoThumbnailBase64?: string | null;
        matriculas: { MATNumero: string; MATCurso: string | null; MATSerie: string | null; MATTurma: string | null }[];
    };
    usuarioCriacao: { USRCodigo: number; USRNome: string } | null;
    usuarioAlteracao: { USRCodigo: number; USRNome: string } | null;
}

function fotoDataUrl(p: RegistroDiario["pessoa"]): string | null {
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

interface Meta { total: number; page: number; limit: number; totalPages: number; }

const REGISTROS_LIMIT_OPTIONS = [10, 20, 50, 100, 200, 500, 1000] as const;

function formatMostrandoIntervalo(meta: Meta): string {
    const { total, page, limit: l } = meta;
    if (total === 0) return "Mostrando 0 de 0";
    const start = (page - 1) * l + 1;
    const end = Math.min(page * l, total);
    return `Mostrando ${start}–${end} de ${total}`;
}

const STATUS_BADGE: Record<string, string> = {
    ENVIADO: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    ERRO: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    MANUAL: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    PENDENTE: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

function formatDt(dt: string | null) {
    if (!dt) return "—";
    return new Date(dt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatRpdDataDia(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function RegistrosPage() {
    const { codigoInstituicao } = useTenant();
    const { can } = usePermissions();
    const { showToast } = useToast();

    const canExec = canExecuteRegistroDiario(can);
    const canWrite = canWriteRegistroDiario(can);

    const [registros, setRegistros] = useState<RegistroDiario[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [filtros, setFiltros] = useState<RegistrosFiltrosAplicados>(REGISTROS_FILTROS_VAZIOS);
    const [opcoesFiltro, setOpcoesFiltro] = useState<{ cursos: string[]; series: string[]; turmas: string[] }>({
        cursos: [],
        series: [],
        turmas: [],
    });

    const [showAdmin, setShowAdmin] = useState(false);
    const [showReprocessar, setShowReprocessar] = useState(false);
    const [showManutencao, setShowManutencao] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const [passagensModal, setPassagensModal] = useState<{
        PESCodigo: number;
        RPDData: string;
        nomePessoa: string;
    } | null>(null);

    const [editModal, setEditModal] = useState<{
        registro: RegistroDiario;
        nomePessoa: string;
    } | null>(null);

    const [deleteModal, setDeleteModal] = useState<{
        registro: RegistroDiario;
        nomePessoa: string;
    } | null>(null);

    const loadOpcoesFiltro = useCallback(async () => {
        if (!codigoInstituicao) return;
        try {
            const data = await apiGet<{ cursos: string[]; series: string[]; turmas: string[] }>(
                `/instituicao/${codigoInstituicao}/matricula/opcoes-filtro`
            );
            setOpcoesFiltro({ cursos: data.cursos ?? [], series: data.series ?? [], turmas: data.turmas ?? [] });
        } catch {
            setOpcoesFiltro({ cursos: [], series: [], turmas: [] });
        }
    }, [codigoInstituicao]);

    const load = useCallback(async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const qs = buildRegistrosQuery(page, limit, filtros);
            const res = await apiGet<{ data: RegistroDiario[]; meta: Meta }>(
                `/instituicao/${codigoInstituicao}/registro-diario?${qs}`
            );
            setRegistros(res.data || []);
            setMeta(res.meta);
        } catch (error: any) {
            showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar os registros.");
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, page, limit, filtros, showToast]);

    useEffect(() => { loadOpcoesFiltro(); }, [loadOpcoesFiltro]);
    useEffect(() => { load(); }, [load]);

    const handleFiltrar = (f: RegistrosFiltrosAplicados) => {
        setFiltros(f);
        setPage(1);
    };

    const handleSync = async () => {
        if (!codigoInstituicao || syncing) return;
        setSyncing(true);
        try {
            await apiPost(`/instituicao/${codigoInstituicao}/registro-diario/sync`, {});
            showToast("success", "Sincronização enfileirada", "O worker processará as passagens pendentes em breve.");
        } catch (err: any) {
            showToast("error", "Erro ao sincronizar", err.message || "Tente novamente.");
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Registros de Presença</h2>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Botão Sync — Gestor+ */}
                    {canExec && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSync}
                            disabled={syncing}
                            className="flex items-center gap-2"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            {syncing ? "Sincronizando…" : "Sync"}
                        </Button>
                    )}

                    {/* Botão Reprocessar (só Gestor sem Admin) ou Manutenção (Admin+) */}
                    {canExec && !canWrite && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowReprocessar(true)}
                            className="flex items-center gap-2"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                            Reprocessar
                        </Button>
                    )}

                    {canWrite && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowManutencao(true)}
                            className="flex items-center gap-2"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                            </svg>
                            Manutenção
                        </Button>
                    )}

                    {/* Botão Administrar (Gennera) — Gestor+ */}
                    {canExec && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAdmin(true)}
                            className="flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Administrar Frequências
                        </Button>
                    )}
                </div>
            </div>

            <RegistrosFiltros
                aplicados={filtros}
                onAplicar={handleFiltrar}
                onLimpar={() => { setFiltros(REGISTROS_FILTROS_VAZIOS); setPage(1); }}
                cursosDisponiveis={opcoesFiltro.cursos}
                seriesDisponiveis={opcoesFiltro.series}
                turmasDisponiveis={opcoesFiltro.turmas}
            />

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 w-16">Foto</th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Nome</th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Matrícula / Turma</th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Entrada</th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Saída</th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Origem</th>
                            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 w-px whitespace-nowrap">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                                    Carregando...
                                </td>
                            </tr>
                        ) : registros.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                                    Nenhum registro encontrado.
                                </td>
                            </tr>
                        ) : registros.map((r, idx) => {
                            const prev = idx > 0 ? registros[idx - 1] : null;
                            const isContin =
                                prev !== null &&
                                prev.pessoa.PESCodigo === r.pessoa.PESCodigo &&
                                prev.RPDData === r.RPDData;

                            const mat = r.pessoa.matriculas?.[0];
                            const nomeExibicao = r.pessoa.PESNomeSocial || r.pessoa.PESNome;
                            const fotoSrc = isContin ? null : fotoDataUrl(r.pessoa);
                            const initial = nomeExibicao.trim().charAt(0).toUpperCase() || "?";
                            const origemNome = r.usuarioCriacao?.USRNome ?? null;
                            return (
                                <tr
                                    key={r.RPDCodigo}
                                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${isContin ? "bg-gray-50/50 dark:bg-gray-800/20" : ""}`}
                                >
                                    <td className="px-4 py-3 align-middle">
                                        {isContin ? (
                                            <div className="flex h-12 w-12 items-center justify-center text-gray-300 dark:text-gray-600" aria-hidden>
                                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.49 12-4.99 5m0 0-5-5m5 5V7" />
                                                </svg>
                                            </div>
                                        ) : fotoSrc ? (
                                            <img
                                                src={fotoSrc}
                                                alt={`Foto de ${nomeExibicao}`}
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
                                    <td className="px-4 py-3">
                                        {!isContin && (
                                            <>
                                                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                                    {nomeExibicao}
                                                </p>
                                                {r.pessoa.PESDocumento && (
                                                    <p className="text-xs text-gray-400">{r.pessoa.PESDocumento}</p>
                                                )}
                                            </>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {!isContin && (mat ? (
                                            <span>{mat.MATNumero}{mat.MATTurma ? ` · ${mat.MATTurma}` : ""}{mat.MATCurso ? ` · ${mat.MATCurso}` : ""}</span>
                                        ) : "—")}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-800 dark:text-white/80 whitespace-nowrap">
                                        {isContin ? (
                                            <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
                                                janela #{r.RPDJanelaIndice}
                                            </span>
                                        ) : (
                                            <>
                                                {formatRpdDataDia(r.RPDData)}
                                                {r.RPDJanelaIndice > 1 && (
                                                    <span className="ml-1 text-xs text-gray-400">#{r.RPDJanelaIndice}</span>
                                                )}
                                            </>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                        {formatDt(r.RPDDataEntrada)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                        {formatDt(r.RPDDataSaida)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.RPDStatus] ?? STATUS_BADGE.PENDENTE}`}>
                                            {r.RPDStatus}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {origemNome ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            {can("passagem", "read") && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setPassagensModal({
                                                            PESCodigo: r.pessoa.PESCodigo,
                                                            RPDData: r.RPDData,
                                                            nomePessoa: nomeExibicao,
                                                        })
                                                    }
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-brand-500 hover:text-brand-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
                                                    title="Ver passagens do dia"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12.75h12m-12 6h12m-16.5-12h.008v.008H4.5V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0ZM4.5 12.75h.008v.008H4.5v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0ZM4.5 18.75h.008v.008H4.5V18.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Z" />
                                                    </svg>
                                                </button>
                                            )}

                                            {canWrite && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditModal({ registro: r, nomePessoa: nomeExibicao })}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-brand-500 hover:text-brand-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:text-brand-400"
                                                        title="Editar registro"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteModal({ registro: r, nomePessoa: nomeExibicao })}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-red-500 transition-colors hover:border-red-400 hover:bg-red-50 dark:border-gray-600 dark:bg-gray-800 dark:text-red-400 dark:hover:border-red-500 dark:hover:bg-red-900/20"
                                                        title="Excluir registro"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                        </svg>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between px-2">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Por página:</span>
                    <select
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    >
                        {REGISTROS_LIMIT_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>

                {meta.totalPages > 1 ? (
                    <div className="flex justify-center sm:flex-1">
                        <PaginationWithIcon
                            key={`reg-rpd-${page}-${meta.totalPages}-${limit}`}
                            totalPages={meta.totalPages}
                            initialPage={page}
                            onPageChange={setPage}
                        />
                    </div>
                ) : (
                    <div className="hidden sm:block sm:flex-1" aria-hidden />
                )}

                <p className="text-sm text-gray-500 dark:text-gray-400 text-center sm:text-right whitespace-nowrap">
                    {formatMostrandoIntervalo(meta)}
                </p>
            </div>

            {/* Modais */}
            {showAdmin && (
                <AdminLancamentoModal onClose={() => { setShowAdmin(false); load(); }} />
            )}

            {showReprocessar && (
                <ReprocessarPeriodoModal
                    onClose={() => setShowReprocessar(false)}
                    onSuccess={load}
                />
            )}

            {showManutencao && (
                <RegistrosManutencaoModal
                    onClose={() => setShowManutencao(false)}
                    onReprocessarSuccess={load}
                />
            )}

            {passagensModal && (
                <PassagensDiaModal
                    isOpen
                    onClose={() => setPassagensModal(null)}
                    PESCodigo={passagensModal.PESCodigo}
                    RPDData={passagensModal.RPDData}
                    nomePessoa={passagensModal.nomePessoa}
                />
            )}

            {editModal && (
                <RegistroDiarioEditModal
                    rpdCodigo={editModal.registro.RPDCodigo}
                    RPDDataEntrada={editModal.registro.RPDDataEntrada}
                    RPDDataSaida={editModal.registro.RPDDataSaida}
                    nomePessoa={editModal.nomePessoa}
                    onClose={() => setEditModal(null)}
                    onSuccess={load}
                />
            )}

            {deleteModal && (
                <ConfirmDeleteRegistroModal
                    rpdCodigo={deleteModal.registro.RPDCodigo}
                    nomePessoa={deleteModal.nomePessoa}
                    dataRegistro={deleteModal.registro.RPDData}
                    onClose={() => setDeleteModal(null)}
                    onSuccess={load}
                />
            )}
        </div>
    );
}
