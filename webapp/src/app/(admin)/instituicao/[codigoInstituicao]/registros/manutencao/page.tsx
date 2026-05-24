"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/context/TenantContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import PessoaInstituicaoAsyncMultiSelect from "@/components/form/PessoaInstituicaoAsyncMultiSelect";
import SearchableMultiSelect from "@/components/form/SearchableMultiSelect";
import { canWriteRegistroDiario } from "@/lib/registro-diario-access";
import AlterarRegistrosModal from "../components/AlterarRegistrosModal";
import CriarManualRegistrosModal from "../components/CriarManualRegistrosModal";
import { Modal } from "@/components/ui/modal";

interface RegistroManutencao {
    RPDCodigo: number;
    RPDData: string;
    RPDDataEntrada: string | null;
    RPDDataSaida: string | null;
    RPDStatus: string;
    RPDJanelaIndice: number;
    pessoa: {
        PESCodigo: number;
        PESNome: string;
        PESNomeSocial: string | null;
        PESDocumento: string | null;
        matriculas: { MATNumero: string; MATCurso: string | null; MATSerie: string | null; MATTurma: string | null }[];
    } | null;
    usuarioCriacao: { USRCodigo: number; USRNome: string } | null;
    usuarioAlteracao: { USRCodigo: number; USRNome: string } | null;
    periodo: { PERCodigo: number; PERNome: string } | null;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

interface FiltrosState {
    pessoasCodigos: number[];
    MATCurso: string[];
    MATSerie: string[];
    MATTurma: string[];
    dataHoraInicio: string;
    dataHoraFim: string;
    entradasVazias: boolean;
    saidasVazias: boolean;
}

const FILTROS_VAZIOS: FiltrosState = {
    pessoasCodigos: [],
    MATCurso: [],
    MATSerie: [],
    MATTurma: [],
    dataHoraInicio: "",
    dataHoraFim: "",
    entradasVazias: false,
    saidasVazias: false,
};

function formatDt(dt: string | null) {
    if (!dt) return "—";
    return new Date(dt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDateBr(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function buildQuery(page: number, limit: number, f: FiltrosState): string {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    f.pessoasCodigos.forEach((c) => p.append("pessoasCodigos", String(c)));
    for (const c of f.MATCurso) p.append("MATCurso", c);
    for (const s of f.MATSerie) p.append("MATSerie", s);
    for (const t of f.MATTurma) p.append("MATTurma", t);
    if (f.dataHoraInicio) p.set("dataHoraInicio", new Date(f.dataHoraInicio).toISOString());
    if (f.dataHoraFim) p.set("dataHoraFim", new Date(f.dataHoraFim).toISOString());
    if (f.entradasVazias) p.set("entradasVazias", "true");
    if (f.saidasVazias) p.set("saidasVazias", "true");
    return p.toString();
}

const STATUS_BADGE: Record<string, string> = {
    ENVIADO: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    ERRO: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    MANUAL: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    PENDENTE: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

export default function ManutencaoPage() {
    const router = useRouter();
    const { codigoInstituicao } = useTenant();
    const { can } = usePermissions();
    const { showToast } = useToast();

    // Guard Admin+
    useEffect(() => {
        if (!canWriteRegistroDiario(can)) {
            router.replace(`/instituicao/${codigoInstituicao}/registros`);
        }
    }, [can, codigoInstituicao, router]);

    const [registros, setRegistros] = useState<RegistroManutencao[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [limit] = useState(20);

    const [draft, setDraft] = useState<FiltrosState>(FILTROS_VAZIOS);
    const [aplicados, setAplicados] = useState<FiltrosState>(FILTROS_VAZIOS);
    const [hasConsultado, setHasConsultado] = useState(false);
    const [opcoesFiltro, setOpcoesFiltro] = useState<{ cursos: string[]; series: string[]; turmas: string[] }>({
        cursos: [],
        series: [],
        turmas: [],
    });

    const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

    const [showCriarManual, setShowCriarManual] = useState(false);
    const [showAlterar, setShowAlterar] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ rpdCodigos: number[] } | null>(null);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!codigoInstituicao) return;
        apiGet<{ cursos: string[]; series: string[]; turmas: string[] }>(
            `/instituicao/${codigoInstituicao}/matricula/opcoes-filtro`
        )
            .then((data) => setOpcoesFiltro({ cursos: data.cursos ?? [], series: data.series ?? [], turmas: data.turmas ?? [] }))
            .catch(() => setOpcoesFiltro({ cursos: [], series: [], turmas: [] }));
    }, [codigoInstituicao]);

    const load = useCallback(async () => {
        if (!codigoInstituicao || !hasConsultado) return;
        setLoading(true);
        setSelecionados(new Set());
        try {
            const qs = buildQuery(page, limit, aplicados);
            const res = await apiGet<{ data: RegistroManutencao[]; meta: Meta }>(
                `/instituicao/${codigoInstituicao}/registro-diario/manutencao?${qs}`,
            );
            setRegistros(res.data || []);
            setMeta(res.meta);
        } catch (err: any) {
            showToast("error", "Erro ao carregar", err.message || "Tente novamente.");
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, page, limit, aplicados, hasConsultado, showToast]);

    useEffect(() => { load(); }, [load]);

    const handleConsultar = () => {
        setAplicados(draft);
        setPage(1);
        setHasConsultado(true);
    };

    const handleLimpar = () => {
        setDraft(FILTROS_VAZIOS);
        setAplicados(FILTROS_VAZIOS);
        setPage(1);
        setHasConsultado(false);
        setRegistros([]);
    };

    const toggleSelecionado = (cod: number) => {
        setSelecionados((prev) => {
            const next = new Set(prev);
            next.has(cod) ? next.delete(cod) : next.add(cod);
            return next;
        });
    };

    const toggleTodos = () => {
        if (selecionados.size === registros.length) {
            setSelecionados(new Set());
        } else {
            setSelecionados(new Set(registros.map((r) => r.RPDCodigo)));
        }
    };

    const handleExcluirBulk = async () => {
        if (!codigoInstituicao || !deleteModal) return;
        setDeleting(true);
        try {
            const res = await apiPost<{ excluidos: number }>(
                `/instituicao/${codigoInstituicao}/registro-diario/manutencao/excluir`,
                { rpdCodigos: deleteModal.rpdCodigos },
            );
            showToast("success", "Registros excluídos", `${res.excluidos} registro(s) removidos.`);
            setDeleteModal(null);
            setSelecionados(new Set());
            load();
        } catch (err: any) {
            showToast("error", "Erro ao excluir", err.message || "Tente novamente.");
        } finally {
            setDeleting(false);
        }
    };

    const selecionadosArray = [...selecionados];

    return (
        <div className="space-y-5 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Manutenção de Registros</h2>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        Consulta avançada, criação manual e correção de registros diários.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        onClick={() => setShowCriarManual(true)}
                    >
                        Criar Manualmente Registros
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.back()}
                    >
                        Voltar
                    </Button>
                </div>
            </div>

            {/* Filtros */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="space-y-4">
                    {codigoInstituicao && (
                        <PessoaInstituicaoAsyncMultiSelect
                            instituicaoCodigo={codigoInstituicao}
                            value={draft.pessoasCodigos}
                            onChange={(v) => setDraft((f) => ({ ...f, pessoasCodigos: v }))}
                            label="Pessoas (vazio = todas)"
                            placeholder="Buscar pessoas..."
                        />
                    )}

                    <div className="grid grid-cols-3 gap-3">
                        <SearchableMultiSelect
                            label="Curso"
                            placeholder="Selecione um ou mais cursos"
                            options={opcoesFiltro.cursos.map((c) => ({ value: c, label: c }))}
                            value={draft.MATCurso}
                            onChange={(MATCurso) => setDraft((f) => ({ ...f, MATCurso }))}
                        />
                        <SearchableMultiSelect
                            label="Módulo / Série"
                            placeholder="Selecione um ou mais módulos/séries"
                            options={opcoesFiltro.series.map((s) => ({ value: s, label: s }))}
                            value={draft.MATSerie}
                            onChange={(MATSerie) => setDraft((f) => ({ ...f, MATSerie }))}
                        />
                        <SearchableMultiSelect
                            label="Turma"
                            placeholder="Selecione uma ou mais turmas"
                            options={opcoesFiltro.turmas.map((t) => ({ value: t, label: t }))}
                            value={draft.MATTurma}
                            onChange={(MATTurma) => setDraft((f) => ({ ...f, MATTurma }))}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Data/hora início</Label>
                            <InputField
                                type="datetime-local"
                                value={draft.dataHoraInicio}
                                onChange={(e) => setDraft((f) => ({ ...f, dataHoraInicio: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Data/hora fim</Label>
                            <InputField
                                type="datetime-local"
                                value={draft.dataHoraFim}
                                onChange={(e) => setDraft((f) => ({ ...f, dataHoraFim: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={draft.entradasVazias}
                                onChange={(e) => setDraft((f) => ({ ...f, entradasVazias: e.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300 text-brand-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Entradas vazias</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={draft.saidasVazias}
                                onChange={(e) => setDraft((f) => ({ ...f, saidasVazias: e.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300 text-brand-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Saídas vazias</span>
                        </label>

                        <div className="ml-auto flex gap-3">
                            <Button size="sm" onClick={handleConsultar} disabled={loading}>
                                {loading ? "Consultando…" : "Consultar"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleLimpar}>
                                Limpar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabela */}
            {hasConsultado && (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800/50">
                            <tr>
                                <th className="w-10 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={registros.length > 0 && selecionados.size === registros.length}
                                        onChange={toggleTodos}
                                        className="h-4 w-4 rounded border-gray-300 text-brand-500"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Nome</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Janela</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Entrada</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Saída</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Origem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">Carregando...</td>
                                </tr>
                            ) : registros.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                                        Nenhum registro encontrado.
                                    </td>
                                </tr>
                            ) : registros.map((r) => {
                                const nome = r.pessoa?.PESNomeSocial || r.pessoa?.PESNome || "—";
                                const mat = r.pessoa?.matriculas?.[0];
                                const origemNome = r.usuarioCriacao?.USRNome
                                    ?? r.usuarioAlteracao?.USRNome
                                    ?? null;
                                return (
                                    <tr
                                        key={r.RPDCodigo}
                                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${selecionados.has(r.RPDCodigo) ? "bg-brand-50 dark:bg-brand-900/10" : ""}`}
                                    >
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selecionados.has(r.RPDCodigo)}
                                                onChange={() => toggleSelecionado(r.RPDCodigo)}
                                                className="h-4 w-4 rounded border-gray-300 text-brand-500"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-medium text-gray-800 dark:text-white/90">{nome}</p>
                                            {mat && (
                                                <p className="text-xs text-gray-400">
                                                    {mat.MATNumero}{mat.MATTurma ? ` · ${mat.MATTurma}` : ""}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800 dark:text-white/80 whitespace-nowrap">
                                            {formatDateBr(r.RPDData)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            #{r.RPDJanelaIndice}
                                            {r.periodo && (
                                                <span className="ml-1 text-xs">({r.periodo.PERNome})</span>
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
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Paginação */}
            {hasConsultado && meta.totalPages > 1 && (
                <div className="flex justify-center">
                    <PaginationWithIcon
                        key={`man-${page}-${meta.totalPages}`}
                        totalPages={meta.totalPages}
                        initialPage={page}
                        onPageChange={setPage}
                    />
                </div>
            )}

            {/* Barra flutuante de seleção */}
            {selecionados.size > 0 && (
                <div className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
                    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {selecionados.size} selecionado(s)
                        </span>
                        <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowAlterar(true)}
                        >
                            Alterar Manualmente
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setDeleteModal({ rpdCodigos: selecionadosArray })}
                            className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                        >
                            Excluir Registros
                        </Button>
                        <button
                            type="button"
                            onClick={() => setSelecionados(new Set())}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Modais */}
            {showCriarManual && (
                <CriarManualRegistrosModal
                    onClose={() => setShowCriarManual(false)}
                    onSuccess={load}
                />
            )}

            {showAlterar && (
                <AlterarRegistrosModal
                    rpdCodigos={selecionadosArray}
                    onClose={() => setShowAlterar(false)}
                    onSuccess={load}
                />
            )}

            {deleteModal && (
                <Modal
                    isOpen
                    onClose={() => setDeleteModal(null)}
                    className="max-w-sm p-6"
                >
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Excluir registros?</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            <strong>{deleteModal.rpdCodigos.length}</strong> registro(s) serão excluídos permanentemente.
                            Esta ação não pode ser desfeita.
                        </p>
                        <div className="flex gap-3">
                            <Button
                                size="sm"
                                onClick={handleExcluirBulk}
                                disabled={deleting}
                                className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                            >
                                {deleting ? "Excluindo…" : "Excluir"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDeleteModal(null)} disabled={deleting}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
