"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import { Modal } from "@/components/ui/modal";
import PessoaInstituicaoAsyncMultiSelect from "@/components/form/PessoaInstituicaoAsyncMultiSelect";
import SearchableMultiSelect from "@/components/form/SearchableMultiSelect";
import JanelasDesejadasEditor, { type Janela } from "./JanelasDesejadasEditor";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

interface PreviewItem {
    pessoa: { PESCodigo: number; PESNome: string; PESNomeSocial: string | null } | null;
    RPDData: string;
    RPDCodigo: number | null;
    acao: "criar" | "substituir";
}

interface PreviewMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface FiltrosState {
    pessoasCodigos: number[];
    MATCurso: string[];
    MATSerie: string[];
    MATTurma: string[];
    dataHoraInicio: string;
    dataHoraFim: string;
}

const FILTROS_VAZIOS: FiltrosState = {
    pessoasCodigos: [],
    MATCurso: [],
    MATSerie: [],
    MATTurma: [],
    dataHoraInicio: "",
    dataHoraFim: "",
};

interface Props {
    onClose: () => void;
    onSuccess?: () => void;
}

function formatDateBr(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function CriarManualRegistrosModal({ onClose, onSuccess }: Props) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();

    const [step, setStep] = useState<1 | 2>(1);
    const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_VAZIOS);
    const [opcoesFiltro, setOpcoesFiltro] = useState<{ cursos: string[]; series: string[]; turmas: string[] }>({
        cursos: [],
        series: [],
        turmas: [],
    });
    const [preview, setPreview] = useState<PreviewItem[]>([]);
    const [previewMeta, setPreviewMeta] = useState<PreviewMeta | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [janelas, setJanelas] = useState<Janela[]>([{ horaEntrada: "", horaSaida: "" }]);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const filtrosValidos = !!filtros.dataHoraInicio && !!filtros.dataHoraFim;

    const janelasTodas = janelas.filter((j) => HHMM.test(j.horaEntrada) && HHMM.test(j.horaSaida));
    const janelaValidas = janelas.length > 0 && janelasTodas.length === janelas.length;

    const totalPessoas = previewMeta
        ? [...new Set(preview.map((p) => p.pessoa?.PESCodigo).filter(Boolean))].length
        : 0;
    const totalDias = previewMeta ? [...new Set(preview.map((p) => p.RPDData))].length : 0;

    useEffect(() => {
        if (!codigoInstituicao) return;
        apiGet<{ cursos: string[]; series: string[]; turmas: string[] }>(
            `/instituicao/${codigoInstituicao}/matricula/opcoes-filtro`
        )
            .then((data) => setOpcoesFiltro({ cursos: data.cursos ?? [], series: data.series ?? [], turmas: data.turmas ?? [] }))
            .catch(() => setOpcoesFiltro({ cursos: [], series: [], turmas: [] }));
    }, [codigoInstituicao]);

    const handleVerificar = async () => {
        if (!codigoInstituicao || !filtrosValidos) return;
        setLoadingPreview(true);
        try {
            const res = await apiPost<{ data: PreviewItem[]; meta: PreviewMeta }>(
                `/instituicao/${codigoInstituicao}/registro-diario/manutencao/preview-criacao?page=1&limit=100`,
                buildFiltrosPayload(filtros),
            );
            setPreview(res.data || []);
            setPreviewMeta(res.meta);
            setStep(2);
        } catch (err: any) {
            showToast("error", "Erro ao verificar", err.message || "Tente novamente.");
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleCriar = async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const res = await apiPost<{
                pessoas: number;
                dias: number;
                janelasPorDia: number;
                rpdCriados: number;
                rpdSubstituidos: number;
                passagensMarcadas: number;
            }>(
                `/instituicao/${codigoInstituicao}/registro-diario/manutencao/criar-manual`,
                { filtros: buildFiltrosPayload(filtros), janelasDesejadas: janelasTodas },
            );
            setConfirmOpen(false);
            showToast(
                "success",
                "Registros criados",
                `${res.rpdCriados} criados, ${res.rpdSubstituidos} substituídos em ${res.pessoas} pessoa(s) × ${res.dias} dia(s).`,
            );
            onSuccess?.();
            onClose();
        } catch (err: any) {
            showToast("error", "Erro ao criar registros", err.message || "Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
            >
                <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl dark:bg-gray-900 max-h-[90vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700 shrink-0">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                                Criar Registros Manualmente
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {step === 1 ? "Passo 1 — Filtros e preview" : "Passo 2 — Janelas desejadas"}
                            </p>
                        </div>
                        {!loading && (
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Body scrollável */}
                    <div className="overflow-y-auto flex-1 p-6">
                        {step === 1 ? (
                            <div className="space-y-5">
                                {codigoInstituicao && (
                                    <PessoaInstituicaoAsyncMultiSelect
                                        instituicaoCodigo={codigoInstituicao}
                                        value={filtros.pessoasCodigos}
                                        onChange={(v) => setFiltros((f) => ({ ...f, pessoasCodigos: v }))}
                                        label="Pessoas (vazio = todas)"
                                        placeholder="Buscar pessoas..."
                                    />
                                )}

                                <div className="grid grid-cols-3 gap-3">
                                    <SearchableMultiSelect
                                        label="Curso"
                                        placeholder="Selecione um ou mais cursos"
                                        options={opcoesFiltro.cursos.map((c) => ({ value: c, label: c }))}
                                        value={filtros.MATCurso}
                                        onChange={(MATCurso) => setFiltros((f) => ({ ...f, MATCurso }))}
                                    />
                                    <SearchableMultiSelect
                                        label="Módulo / Série"
                                        placeholder="Selecione um ou mais módulos/séries"
                                        options={opcoesFiltro.series.map((s) => ({ value: s, label: s }))}
                                        value={filtros.MATSerie}
                                        onChange={(MATSerie) => setFiltros((f) => ({ ...f, MATSerie }))}
                                    />
                                    <SearchableMultiSelect
                                        label="Turma"
                                        placeholder="Selecione uma ou mais turmas"
                                        options={opcoesFiltro.turmas.map((t) => ({ value: t, label: t }))}
                                        value={filtros.MATTurma}
                                        onChange={(MATTurma) => setFiltros((f) => ({ ...f, MATTurma }))}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Data/hora início *</Label>
                                        <InputField
                                            type="datetime-local"
                                            value={filtros.dataHoraInicio}
                                            onChange={(e) => setFiltros((f) => ({ ...f, dataHoraInicio: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <Label>Data/hora fim *</Label>
                                        <InputField
                                            type="datetime-local"
                                            value={filtros.dataHoraFim}
                                            onChange={(e) => setFiltros((f) => ({ ...f, dataHoraFim: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-1">
                                    <Button
                                        size="sm"
                                        disabled={!filtrosValidos || loadingPreview}
                                        onClick={handleVerificar}
                                    >
                                        {loadingPreview ? "Verificando…" : "Verificar"}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={onClose}>
                                        Cancelar
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {/* Resumo do preview */}
                                {previewMeta && (
                                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                                        <p className="text-xs text-blue-700 dark:text-blue-300">
                                            Preview:{" "}
                                            <strong>{previewMeta.total}</strong> alvo(s) —{" "}
                                            <strong>{preview.filter((p) => p.acao === "substituir").length}</strong> substituições e{" "}
                                            <strong>{preview.filter((p) => p.acao === "criar").length}</strong> criações.
                                        </p>
                                    </div>
                                )}

                                {/* Preview compacto */}
                                {preview.length > 0 && (
                                    <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                                        <table className="min-w-full text-xs">
                                            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/80">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Pessoa</th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Data</th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Ação</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {preview.map((item, i) => (
                                                    <tr key={i}>
                                                        <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
                                                            {item.pessoa?.PESNomeSocial || item.pessoa?.PESNome || "—"}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                            {formatDateBr(item.RPDData)}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                                                                item.acao === "substituir"
                                                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                            }`}>
                                                                {item.acao === "substituir" ? "Substituir" : "Criar"}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Editor de janelas */}
                                <div>
                                    <Label>Janelas desejadas por dia</Label>
                                    <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                                        Horários no fuso da instituição (HH:mm). As mesmas janelas serão aplicadas a cada pessoa/dia.
                                    </p>
                                    <JanelasDesejadasEditor janelas={janelas} onChange={setJanelas} />
                                </div>

                                {/* Resumo dinâmico */}
                                {previewMeta && janelas.length > 0 && janelaValidas && (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
                                        Serão criados{" "}
                                        <strong className="text-gray-800 dark:text-white">{previewMeta.total}</strong> alvo(s) ×{" "}
                                        <strong className="text-gray-800 dark:text-white">{janelas.length}</strong> janela(s) ={" "}
                                        <strong className="text-gray-800 dark:text-white">{previewMeta.total * janelas.length}</strong> registros.
                                        Registros automáticos existentes nesses dias serão substituídos.
                                    </div>
                                )}

                                <div className="flex gap-3 pt-1">
                                    <Button
                                        size="sm"
                                        disabled={!janelaValidas || loading}
                                        onClick={() => setConfirmOpen(true)}
                                    >
                                        Criar Registros
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setStep(1)}>
                                        Voltar
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} className="max-w-md p-6">
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Confirmar criação</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Serão criados/substituídos registros para{" "}
                        <strong>{previewMeta?.total ?? 0}</strong> alvo(s) com{" "}
                        <strong>{janelas.length}</strong> janela(s) por dia. Esta operação não pode ser desfeita.
                    </p>
                    <div className="flex gap-3">
                        <Button size="sm" onClick={handleCriar} disabled={loading}>
                            {loading ? "Criando…" : "Confirmar"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

function buildFiltrosPayload(f: FiltrosState) {
    return {
        pessoasCodigos: f.pessoasCodigos.length > 0 ? f.pessoasCodigos : undefined,
        MATCurso: f.MATCurso.length > 0 ? f.MATCurso : undefined,
        MATSerie: f.MATSerie.length > 0 ? f.MATSerie : undefined,
        MATTurma: f.MATTurma.length > 0 ? f.MATTurma : undefined,
        dataHoraInicio: f.dataHoraInicio ? new Date(f.dataHoraInicio).toISOString() : undefined,
        dataHoraFim: f.dataHoraFim ? new Date(f.dataHoraFim).toISOString() : undefined,
    };
}
