"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet, apiPost, apiPatch, apiDelete, apiFetchBlob, triggerBlobDownload } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { useToast } from "@/context/ToastContext";
import { AlertIcon, UserCircleIcon } from "@/icons";
import SearchableSelect from "@/components/form/SearchableSelect";
import MatriculasFiltros, {
    MATRICULA_FILTROS_VAZIOS,
    buildMatriculaListQuery,
    buildMatriculaExportQuery,
    type MatriculaFiltrosAplicados,
    type MatriculaExportPdfOptions,
} from "./components/MatriculasFiltros";

interface Matricula {
    MATCodigo: number;
    PESCodigo: number;
    MATNumero: string;
    MATCurso: string | null;
    MATSerie: string | null;
    MATTurma: string | null;
    MATAtivo: boolean;
    pessoa: {
        PESCodigo: number;
        PESNome: string;
        PESFotoBase64?: string | null;
        PESFotoExtensao?: string | null;
    };
}

interface Pessoa {
    PESCodigo: number;
    PESNome: string;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

type MatriculaExportFormatUi = "csv" | "xlsx" | "pdf";

export default function MatriculasPage() {
    const params = useParams();
    const codigoInstituicao = params?.codigoInstituicao;
    const { can } = usePermissions();
    const { showToast } = useToast();
    const [matriculas, setMatriculas] = useState<Matricula[]>([]);
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [opcoesFiltro, setOpcoesFiltro] = useState<{
        cursos: string[];
        series: string[];
        turmas: string[];
    }>({ cursos: [], series: [], turmas: [] });
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [filtrosAplicados, setFiltrosAplicados] = useState<MatriculaFiltrosAplicados>(
        MATRICULA_FILTROS_VAZIOS
    );

    // Modals
    const enrollmentModal = useModal();
    const deleteModal = useModal();
    const exportModal = useModal();

    const [exportFormat, setExportFormat] = useState<MatriculaExportFormatUi>("csv");
    const [exporting, setExporting] = useState(false);
    const [pdfOrientation, setPdfOrientation] = useState<"landscape" | "portrait">("landscape");
    const [pdfColumns, setPdfColumns] = useState<1 | 2>(1);
    const [pdfRowsPerPage, setPdfRowsPerPage] = useState(10);

    const [editing, setEditing] = useState<Matricula | null>(null);
    const [form, setForm] = useState({ MATNumero: "", PESCodigo: 0, MATCurso: "", MATSerie: "", MATTurma: "" });
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Matricula | null>(null);

    const load = useCallback(async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const qs = buildMatriculaListQuery(page, limit, filtrosAplicados);
            const matRes = await apiGet<{ data: Matricula[]; meta: Meta }>(
                `/instituicao/${codigoInstituicao}/matricula?${qs}`
            );
            setMatriculas(matRes.data || []);
            setMeta(matRes.meta);
        } catch (error: any) {
            showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar as matrículas.");
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, page, limit, filtrosAplicados, showToast]);

    const loadPessoasParaModal = useCallback(async (): Promise<Pessoa[]> => {
        if (!codigoInstituicao) return [];
        const pesRes = await apiGet<{ data: Pessoa[] }>(
            `/instituicao/${codigoInstituicao}/pessoa?limit=100`
        );
        const list = pesRes.data || [];
        setPessoas(list);
        return list;
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

    useEffect(() => {
        loadOpcoesFiltro();
    }, [loadOpcoesFiltro]);

    useEffect(() => { load(); }, [load]);

    const openNew = async () => {
        setEditing(null);
        let list: Pessoa[] = [];
        try {
            list = await loadPessoasParaModal();
        } catch (error: any) {
            showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar as pessoas.");
        }
        setForm({
            MATNumero: "",
            PESCodigo: list[0]?.PESCodigo || 0,
            MATCurso: "",
            MATSerie: "",
            MATTurma: "",
        });
        enrollmentModal.openModal();
    };

    const openEdit = async (m: Matricula) => {
        setEditing(m);
        let list: Pessoa[] = [];
        try {
            list = await loadPessoasParaModal();
        } catch (error: any) {
            showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar as pessoas.");
        }
        const comAtual = list.some((p) => p.PESCodigo === m.PESCodigo)
            ? list
            : [{ PESCodigo: m.PESCodigo, PESNome: m.pessoa.PESNome }, ...list];
        setPessoas(comAtual);
        setForm({
            MATNumero: m.MATNumero,
            PESCodigo: m.PESCodigo,
            MATCurso: m.MATCurso || "",
            MATSerie: m.MATSerie || "",
            MATTurma: m.MATTurma || "",
        });
        enrollmentModal.openModal();
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/instituicao/${codigoInstituicao}/matricula/${editing.MATCodigo}`, form);
                showToast("success", "Matrícula atualizada", "Os dados foram salvos com sucesso.");
            } else {
                await apiPost(`/instituicao/${codigoInstituicao}/matricula`, form);
                showToast("success", "Matrícula criada", "O novo registro foi cadastrado com sucesso.");
            }
            enrollmentModal.closeModal();
            load();
            loadOpcoesFiltro();
        } catch (error: any) {
            showToast("error", "Erro ao salvar", error.message || "Ocorreu um erro ao processar a solicitação.");
        } finally { setSaving(false); }
    };

    const handleDeleteClick = (m: Matricula) => {
        setDeleteTarget(m);
        deleteModal.openModal();
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await apiDelete(`/instituicao/${codigoInstituicao}/matricula/${deleteTarget.MATCodigo}`);
            showToast("success", "Matrícula excluída", "O registro foi removido com sucesso.");
            deleteModal.closeModal();
            load();
            loadOpcoesFiltro();
        } catch (error: any) {
            showToast("error", "Erro ao excluir", error.message || "Não foi possível excluir a matrícula.");
        } finally { setSaving(false); }
    };

    const openExportModal = () => {
        setExportFormat("csv");
        setPdfOrientation("landscape");
        setPdfColumns(1);
        setPdfRowsPerPage(10);
        exportModal.openModal();
    };

    const handleExportDownload = async () => {
        if (!codigoInstituicao) return;
        let pdfOptions: MatriculaExportPdfOptions | undefined;
        if (exportFormat === "pdf") {
            let r = Number(pdfRowsPerPage);
            if (!Number.isFinite(r)) r = 10;
            r = Math.round(r);
            if (r < 3 || r > 60) {
                showToast(
                    "error",
                    "PDF",
                    "Informe entre 3 e 60 registros por coluna."
                );
                return;
            }
            pdfOptions = {
                pdfOrientation,
                pdfColumns,
                pdfRowsPerPage: r,
            };
        }
        setExporting(true);
        try {
            const qs = buildMatriculaExportQuery(
                exportFormat,
                filtrosAplicados,
                pdfOptions
            );
            const { blob, suggestedFilename } = await apiFetchBlob(
                `/instituicao/${codigoInstituicao}/matricula/export?${qs}`,
                { timeoutMs: 120_000 }
            );
            const ext =
                exportFormat === "csv" ? ".csv" : exportFormat === "xlsx" ? ".xlsx" : ".pdf";
            triggerBlobDownload(blob, suggestedFilename ?? `matriculas${ext}`);
            exportModal.closeModal();
            showToast("success", "Exportação", "Download iniciado.");
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Não foi possível exportar.";
            showToast("error", "Erro ao exportar", msg);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Matrículas</h2>
                {can("matricula", "create") && (
                    <Button size="sm" onClick={openNew}>+ Nova Matrícula</Button>
                )}
            </div>

            <MatriculasFiltros
                aplicados={filtrosAplicados}
                cursosDisponiveis={opcoesFiltro.cursos}
                seriesDisponiveis={opcoesFiltro.series}
                turmasDisponiveis={opcoesFiltro.turmas}
                onAplicar={(f) => {
                    setFiltrosAplicados(f);
                    setPage(1);
                }}
                onLimpar={() => {
                    setFiltrosAplicados(MATRICULA_FILTROS_VAZIOS);
                    setPage(1);
                }}
                extraActions={
                    can("matricula", "read") ? (
                        <Button type="button" size="sm" variant="outline" onClick={openExportModal}>
                            Exportar
                        </Button>
                    ) : null
                }
            />

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Pessoa</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Número</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Curso/Série</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Turma</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : matriculas.length === 0 ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Nenhuma matrícula encontrada.</td></tr>
                        ) : matriculas.map((m) => (
                            <tr key={m.MATCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-center">
                                            {m.pessoa?.PESFotoBase64 ? (
                                                <img
                                                    src={`data:image/${m.pessoa.PESFotoExtensao || 'png'};base64,${m.pessoa.PESFotoBase64}`}
                                                    alt={m.pessoa?.PESNome}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <UserCircleIcon className="w-6 h-6 text-gray-400" />
                                            )}
                                        </div>
                                        <span className="font-medium">{m.pessoa?.PESNome || "—"}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{m.MATNumero}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                                    {m.MATCurso} {m.MATSerie ? `- ${m.MATSerie}` : ""}
                                </td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{m.MATTurma || "—"}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.MATAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{m.MATAtivo ? "Ativa" : "Inativa"}</span>
                                </td>
                                <td className="px-5 py-3">
                                    <div className="flex flex-wrap gap-2">
                                        {can("pessoa", "update") && (
                                            <a
                                                href={`/instituicao/${codigoInstituicao}/pessoas/${m.PESCodigo}/edit`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-gray-700 hover:underline dark:text-gray-300"
                                            >
                                                Cadastro pessoa
                                            </a>
                                        )}
                                        {can("matricula", "update") && (
                                            <button
                                                type="button"
                                                onClick={() => openEdit(m)}
                                                className="text-xs text-brand-500 hover:underline"
                                            >
                                                Editar
                                            </button>
                                        )}
                                        {can("matricula", "delete") && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteClick(m)}
                                                className="text-xs text-red-500 hover:underline"
                                            >
                                                Excluir
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
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

            {/* Enrollment Modal */}
            <Modal
                isOpen={enrollmentModal.isOpen}
                onClose={enrollmentModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {editing ? "Editar Matrícula" : "Nova Matrícula"}
                    </h3>
                    <div className="space-y-3">
                        <SearchableSelect
                            label="Pessoa *"
                            options={pessoas.map(p => ({ value: p.PESCodigo, label: p.PESNome }))}
                            value={form.PESCodigo}
                            onChange={(val) => setForm({ ...form, PESCodigo: Number(val) })}
                            placeholder="Selecione uma Pessoa"
                        />
                        <input placeholder="Número da Matrícula *" value={form.MATNumero} onChange={(e) => setForm({ ...form, MATNumero: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Curso" value={form.MATCurso} onChange={(e) => setForm({ ...form, MATCurso: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Série" value={form.MATSerie} onChange={(e) => setForm({ ...form, MATSerie: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Turma" value={form.MATTurma} onChange={(e) => setForm({ ...form, MATTurma: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={enrollmentModal.closeModal}>Cancelar</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !form.MATNumero || !form.PESCodigo}>
                            {saving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Deletion Modal */}
            <Modal
                isOpen={deleteModal.isOpen}
                onClose={deleteModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Confirmar Exclusão</h3>
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/10">
                        <div className="flex-shrink-0">
                            <AlertIcon className="h-6 w-6 text-red-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-red-800 dark:text-red-400">Atenção!</h4>
                            <p className="mt-1 text-sm text-red-700 dark:text-red-400/80">
                                Tem certeza que deseja excluir a matrícula <strong>{deleteTarget?.MATNumero}</strong> de <strong>{deleteTarget?.pessoa?.PESNome}</strong>? Esta ação não pode ser desfeita.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={deleteModal.closeModal}>Cancelar</Button>
                        <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-transparent" onClick={confirmDelete} disabled={saving}>
                            {saving ? "Excluindo..." : "Sim, Excluir"}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={exportModal.isOpen}
                onClose={() => {
                    if (!exporting) exportModal.closeModal();
                }}
                className="max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Exportar matrículas
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        O arquivo será gerado no servidor com base nos filtros já aplicados na lista.
                    </p>
                    <fieldset className="space-y-2.5 border-0 p-0 m-0">
                        <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Formato
                        </legend>
                        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-white/90">
                            <input
                                type="radio"
                                name="exportFmtMat"
                                className="h-4 w-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                                checked={exportFormat === "csv"}
                                onChange={() => setExportFormat("csv")}
                                disabled={exporting}
                            />
                            CSV
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-white/90">
                            <input
                                type="radio"
                                name="exportFmtMat"
                                className="h-4 w-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                                checked={exportFormat === "xlsx"}
                                onChange={() => setExportFormat("xlsx")}
                                disabled={exporting}
                            />
                            Excel (.xlsx)
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-white/90">
                            <input
                                type="radio"
                                name="exportFmtMat"
                                className="h-4 w-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                                checked={exportFormat === "pdf"}
                                onChange={() => setExportFormat("pdf")}
                                disabled={exporting}
                            />
                            PDF
                        </label>
                    </fieldset>
                    {exportFormat === "pdf" && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-white/[0.04] space-y-4">
                            <fieldset className="space-y-2.5 border-0 p-0 m-0">
                                <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Orientação
                                </legend>
                                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-white/90">
                                    <input
                                        type="radio"
                                        name="pdfOrientMat"
                                        className="h-4 w-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                                        checked={pdfOrientation === "landscape"}
                                        onChange={() => setPdfOrientation("landscape")}
                                        disabled={exporting}
                                    />
                                    Paisagem
                                </label>
                                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-white/90">
                                    <input
                                        type="radio"
                                        name="pdfOrientMat"
                                        className="h-4 w-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                                        checked={pdfOrientation === "portrait"}
                                        onChange={() => setPdfOrientation("portrait")}
                                        disabled={exporting}
                                    />
                                    Retrato
                                </label>
                            </fieldset>
                            <fieldset className="space-y-2.5 border-0 p-0 m-0">
                                <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Colunas na página
                                </legend>
                                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-white/90">
                                    <input
                                        type="radio"
                                        name="pdfColsMat"
                                        className="h-4 w-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                                        checked={pdfColumns === 1}
                                        onChange={() => setPdfColumns(1)}
                                        disabled={exporting}
                                    />
                                    1 coluna
                                </label>
                                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-800 dark:text-white/90">
                                    <input
                                        type="radio"
                                        name="pdfColsMat"
                                        className="h-4 w-4 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800"
                                        checked={pdfColumns === 2}
                                        onChange={() => setPdfColumns(2)}
                                        disabled={exporting}
                                    />
                                    2 colunas
                                </label>
                            </fieldset>
                            <div>
                                <label
                                    htmlFor="pdf-rows-per-col-mat"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                                >
                                    Registros por coluna
                                </label>
                                <input
                                    id="pdf-rows-per-col-mat"
                                    type="number"
                                    min={3}
                                    max={60}
                                    step={1}
                                    value={pdfRowsPerPage}
                                    onChange={(e) => {
                                        const n = parseInt(e.target.value, 10);
                                        if (!Number.isNaN(n)) setPdfRowsPerPage(n);
                                    }}
                                    disabled={exporting}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Com 2 colunas, até o dobro de matrículas por página (padrão 10 por faixa).
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="flex gap-3 justify-end pt-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={exportModal.closeModal}
                            disabled={exporting}
                        >
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleExportDownload} disabled={exporting}>
                            {exporting ? "Gerando..." : "Exportar"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
