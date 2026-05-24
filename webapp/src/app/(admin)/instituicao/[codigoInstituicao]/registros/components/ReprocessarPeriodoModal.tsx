"use client";

import { useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/context/ToastContext";
import { apiPost } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import { Modal } from "@/components/ui/modal";

interface Props {
    onClose: () => void;
    onSuccess?: () => void;
}

export default function ReprocessarPeriodoModal({ onClose, onSuccess }: Props) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();

    const [dataInicio, setDataInicio] = useState("");
    const [dataFim, setDataFim] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const canSubmit = !!dataInicio && !!dataFim && dataInicio <= dataFim;

    const handleConfirmar = async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const res = await apiPost<{ jobId: string; rpdRemovidos: number; passagensResetadas: number }>(
                `/instituicao/${codigoInstituicao}/registro-diario/reprocessar-periodo`,
                { dataInicio, dataFim },
            );
            setConfirmOpen(false);
            showToast(
                "success",
                "Reprocessamento enfileirado",
                `${res.rpdRemovidos} registros removidos, ${res.passagensResetadas} passagens resetadas. Job: ${res.jobId.slice(0, 8)}…`,
            );
            onSuccess?.();
            onClose();
        } catch (err: any) {
            showToast("error", "Erro ao reprocessar", err.message || "Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div
                className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900">
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Reprocessar Período</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="space-y-5 p-6">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                Os registros diários do intervalo serão <strong>apagados</strong> e as passagens
                                reagregadas conforme o modo de aglutinação atual da instituição.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Data Início *</Label>
                                <InputField
                                    type="date"
                                    value={dataInicio}
                                    onChange={(e) => setDataInicio(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Data Fim *</Label>
                                <InputField
                                    type="date"
                                    value={dataFim}
                                    onChange={(e) => setDataFim(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <Button size="sm" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
                                Reprocessar
                            </Button>
                            <Button size="sm" variant="outline" onClick={onClose}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} className="max-w-md p-6">
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Confirmar reprocessamento</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Todos os registros diários de <strong>{dataInicio}</strong> a <strong>{dataFim}</strong> serão
                        apagados e as passagens do período serão reagregadas. Esta ação não pode ser desfeita.
                    </p>
                    <div className="flex gap-3">
                        <Button size="sm" onClick={handleConfirmar} disabled={loading}>
                            {loading ? "Processando…" : "Confirmar"}
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
