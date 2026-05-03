"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPost } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import PessoaInstituicaoAsyncMultiSelect from "@/components/form/PessoaInstituicaoAsyncMultiSelect";

interface ERPConfig {
    ERPSistema: string;
    ERPUrlBase: string | null;
}

interface JobStatus {
    status: "running" | "done" | "error";
    percent: number;
    total: number;
    processed: number;
    error?: string;
}

interface Props {
    onClose: () => void;
}

export default function AdminLancamentoModal({ onClose }: Props) {
    const { codigoInstituicao } = useTenant();
    const confirmModal = useModal();

    const [erpConfig, setErpConfig] = useState<ERPConfig | null>(null);
    const [loadingErp, setLoadingErp] = useState(true);

    // Form
    const [pessoasSelecionadas, setPessoasSelecionadas] = useState<number[]>([]);
    const [dataInicio, setDataInicio] = useState("");
    const [dataFim, setDataFim] = useState("");
    const [considerarHorario, setConsiderarHorario] = useState(true);
    const [lancaPresenca, setLancaPresenca] = useState(true);

    // Job
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!codigoInstituicao) return;
            try {
                const erp = await apiGet<ERPConfig | null>(`/instituicoes/${codigoInstituicao}/erp-config`).catch(() => null);
                setErpConfig(erp);
            } finally {
                setLoadingErp(false);
            }
        };
        load();
    }, [codigoInstituicao]);

    const stopPolling = useCallback(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, []);

    useEffect(() => () => stopPolling(), [stopPolling]);

    const startPolling = useCallback((jId: string) => {
        pollRef.current = setInterval(async () => {
            try {
                const s = await apiGet<JobStatus>(`/instituicao/${codigoInstituicao}/registro-diario/gennera/lancamento/${jId}`);
                setJobStatus(s);
                if (s.status === "done" || s.status === "error") stopPolling();
            } catch { stopPolling(); }
        }, 1500);
    }, [codigoInstituicao, stopPolling]);

    const handleProcessar = async () => {
        if (!codigoInstituicao) return;
        confirmModal.closeModal();
        try {
            const res = await apiPost<{ jobId: string }>(
                `/instituicao/${codigoInstituicao}/registro-diario/gennera/lancamento`,
                {
                    pessoasCodigos: pessoasSelecionadas.length > 0 ? pessoasSelecionadas : [],
                    dataInicio,
                    dataFim,
                    considerarHorarioPassagens: considerarHorario,
                    lancaPresenca: !considerarHorario ? lancaPresenca : undefined,
                }
            );
            setJobId(res.jobId);
            setJobStatus({ status: "running", percent: 0, total: 0, processed: 0 });
            startPolling(res.jobId);
        } catch (err: any) {
            setJobStatus({ status: "error", percent: 0, total: 0, processed: 0, error: err.message });
        }
    };

    const canSubmit = !!dataInicio && !!dataFim;

    if (loadingErp) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white dark:bg-gray-900">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
                </div>
            </div>
        );
    }

    const isGennera = erpConfig?.ERPSistema === "Gennera";

    return (
        <>
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && !jobId && onClose()}>
                <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl dark:bg-gray-900 overflow-visible">

                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Administrar Frequência</h2>
                        </div>
                        {!jobId && (
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>

                    <div className="p-6">
                        {!isGennera ? (
                            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4">
                                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                                    A funcionalidade de lançamento manual de frequência ainda não está disponível para o ERP <strong>{erpConfig?.ERPSistema || "configurado"}</strong>. Apenas o ERP <strong>Gennera</strong> é suportado no momento.
                                </p>
                            </div>
                        ) : jobId ? (
                            /* Progress overlay */
                            <div className="space-y-6">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Lançamento de frequência no Gennera em andamento. Aguarde até a conclusão.
                                </p>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-600 dark:text-gray-400">
                                            {jobStatus?.status === "done" ? "Concluído" : jobStatus?.status === "error" ? "Erro" : "Processando..."}
                                        </span>
                                        <span className="font-semibold text-gray-800 dark:text-white">{jobStatus?.percent ?? 0}%</span>
                                    </div>
                                    <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                        <div
                                            className={`h-3 rounded-full transition-all duration-500 ${jobStatus?.status === "error" ? "bg-red-500" : jobStatus?.status === "done" ? "bg-green-500" : "bg-brand-500"}`}
                                            style={{ width: `${jobStatus?.percent ?? 0}%` }}
                                        />
                                    </div>
                                    {jobStatus?.total ? (
                                        <p className="text-xs text-gray-400">{jobStatus.processed} / {jobStatus.total} registros</p>
                                    ) : null}
                                    {jobStatus?.error && (
                                        <p className="text-xs text-red-500 mt-1">{jobStatus.error}</p>
                                    )}
                                </div>
                                {(jobStatus?.status === "done" || jobStatus?.status === "error") && (
                                    <Button size="sm" onClick={onClose}>Fechar</Button>
                                )}
                            </div>
                        ) : (
                            /* Formulário */
                            <div className="space-y-5">
                                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                        Esta tela realiza o lançamento manual de frequência no <strong>Gennera</strong>. O processo permanece nesta tela até a conclusão.
                                    </p>
                                </div>

                                {/* Pessoas */}
                                <div>
                                    {codigoInstituicao ? (
                                        <PessoaInstituicaoAsyncMultiSelect
                                            instituicaoCodigo={codigoInstituicao}
                                            value={pessoasSelecionadas}
                                            onChange={setPessoasSelecionadas}
                                            label="Pessoas (deixe vazio para considerar todas)"
                                            placeholder="Selecione pessoas ou deixe vazio para todas"
                                        />
                                    ) : (
                                        <Label>Pessoas (deixe vazio para considerar todas)</Label>
                                    )}
                                    {pessoasSelecionadas.length > 0 && (
                                        <p className="text-xs text-brand-500 mt-1">
                                            {pessoasSelecionadas.length} selecionada(s).{" "}
                                            <button type="button" className="underline" onClick={() => setPessoasSelecionadas([])}>
                                                Limpar seleção
                                            </button>
                                        </p>
                                    )}
                                </div>
                                {/* Datas */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Data de Início *</Label>
                                        <InputField type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                                    </div>
                                    <div>
                                        <Label>Data de Fim *</Label>
                                        <InputField type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                                    </div>
                                </div>

                                {/* Considerar horário das passagens */}
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={considerarHorario}
                                        onChange={(e) => setConsiderarHorario(e.target.checked)}
                                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        Considerar horário das passagens (usa registros de entrada e saída)
                                    </span>
                                </label>

                                {/* Switch presença/falta — só aparece quando não considera horário */}
                                {!considerarHorario && (
                                    <div className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/40">
                                        <span className="text-sm text-gray-700 dark:text-gray-300">Lançar:</span>
                                        <button
                                            type="button"
                                            onClick={() => setLancaPresenca(!lancaPresenca)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${lancaPresenca ? "bg-green-500" : "bg-red-500"}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${lancaPresenca ? "translate-x-6" : "translate-x-1"}`} />
                                        </button>
                                        <span className={`text-sm font-medium ${lancaPresenca ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                            {lancaPresenca ? "Presença" : "Falta"}
                                        </span>
                                    </div>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        size="sm"
                                        disabled={!canSubmit}
                                        onClick={confirmModal.openModal}
                                    >
                                        Processar
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de confirmação */}
            <Modal isOpen={confirmModal.isOpen} onClose={confirmModal.closeModal} className="max-w-md p-6">
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Confirmar lançamento</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Deseja iniciar o lançamento de frequência no Gennera para o período <strong>{dataInicio}</strong> a <strong>{dataFim}</strong>?
                        {pessoasSelecionadas.length > 0 ? ` (${pessoasSelecionadas.length} pessoa(s) selecionada(s))` : " (todas as pessoas)"}
                    </p>
                    <div className="flex gap-3">
                        <Button size="sm" onClick={handleProcessar}>Confirmar</Button>
                        <Button size="sm" variant="outline" onClick={confirmModal.closeModal}>Cancelar</Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
