"use client";

import { useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/context/ToastContext";
import { apiPatch } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import { Modal } from "@/components/ui/modal";

interface Props {
    rpdCodigos: number[];
    onClose: () => void;
    onSuccess: () => void;
}

export default function AlterarRegistrosModal({ rpdCodigos, onClose, onSuccess }: Props) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();

    const [alterarEntrada, setAlterarEntrada] = useState(false);
    const [novaEntrada, setNovaEntrada] = useState("");
    const [alterarSaida, setAlterarSaida] = useState(false);
    const [novaSaida, setNovaSaida] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const canSubmit =
        (alterarEntrada && !!novaEntrada) ||
        (alterarSaida && !!novaSaida);

    const handleProcessar = async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const res = await apiPatch<{ alterados: number }>(
                `/instituicao/${codigoInstituicao}/registro-diario/manutencao/alterar`,
                {
                    rpdCodigos,
                    alterarEntrada,
                    novaEntrada: alterarEntrada && novaEntrada ? new Date(novaEntrada).toISOString() : undefined,
                    alterarSaida,
                    novaSaida: alterarSaida && novaSaida ? new Date(novaSaida).toISOString() : undefined,
                },
            );
            setConfirmOpen(false);
            showToast("success", "Registros alterados", `${res.alterados} registro(s) atualizado(s).`);
            onSuccess();
            onClose();
        } catch (err: any) {
            showToast("error", "Erro ao alterar", err.message || "Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900">
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Alterar Manualmente</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {rpdCodigos.length} registro(s) selecionado(s)
                            </p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="space-y-4 p-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={alterarEntrada}
                                onChange={(e) => setAlterarEntrada(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-brand-500"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Alterar Entrada</span>
                        </label>
                        {alterarEntrada && (
                            <div className="ml-7">
                                <Label>Nova entrada</Label>
                                <InputField
                                    type="datetime-local"
                                    value={novaEntrada}
                                    onChange={(e) => setNovaEntrada(e.target.value)}
                                />
                            </div>
                        )}

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={alterarSaida}
                                onChange={(e) => setAlterarSaida(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-brand-500"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Alterar Saída</span>
                        </label>
                        {alterarSaida && (
                            <div className="ml-7">
                                <Label>Nova saída</Label>
                                <InputField
                                    type="datetime-local"
                                    value={novaSaida}
                                    onChange={(e) => setNovaSaida(e.target.value)}
                                />
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button size="sm" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
                                Processar
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
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Confirmar alteração</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>{rpdCodigos.length}</strong> registro(s) serão alterados
                        {alterarEntrada ? ` — entrada: ${novaEntrada}` : ""}
                        {alterarSaida ? ` — saída: ${novaSaida}` : ""}.
                        Os campos de auditoria serão atualizados.
                    </p>
                    <div className="flex gap-3">
                        <Button size="sm" onClick={handleProcessar} disabled={loading}>
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
