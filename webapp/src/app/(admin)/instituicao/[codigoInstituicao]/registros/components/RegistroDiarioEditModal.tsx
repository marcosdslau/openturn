"use client";

import { useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/context/ToastContext";
import { apiPatch } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";

interface Props {
    rpdCodigo: number;
    RPDDataEntrada: string | null;
    RPDDataSaida: string | null;
    nomePessoa: string;
    onClose: () => void;
    onSuccess: () => void;
}

function toDatetimeLocal(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 16);
}

export default function RegistroDiarioEditModal({
    rpdCodigo,
    RPDDataEntrada,
    RPDDataSaida,
    nomePessoa,
    onClose,
    onSuccess,
}: Props) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();

    const [entrada, setEntrada] = useState(toDatetimeLocal(RPDDataEntrada));
    const [saida, setSaida] = useState(toDatetimeLocal(RPDDataSaida));
    const [loading, setLoading] = useState(false);

    const canSubmit = entrada !== toDatetimeLocal(RPDDataEntrada) || saida !== toDatetimeLocal(RPDDataSaida);

    const handleSalvar = async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const body: Record<string, string> = {};
            if (entrada) body.RPDDataEntrada = new Date(entrada).toISOString();
            if (saida) body.RPDDataSaida = new Date(saida).toISOString();
            await apiPatch(
                `/instituicao/${codigoInstituicao}/registro-diario/${rpdCodigo}`,
                body,
            );
            showToast("success", "Registro atualizado", "As alterações foram salvas.");
            onSuccess();
            onClose();
        } catch (err: any) {
            showToast("error", "Erro ao salvar", err.message || "Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Editar Registro</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{nomePessoa}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-5 p-6">
                    <div>
                        <Label>Entrada</Label>
                        <InputField
                            type="datetime-local"
                            value={entrada}
                            onChange={(e) => setEntrada(e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>Saída</Label>
                        <InputField
                            type="datetime-local"
                            value={saida}
                            onChange={(e) => setSaida(e.target.value)}
                        />
                    </div>

                    <div className="flex gap-3 pt-1">
                        <Button size="sm" disabled={!canSubmit || loading} onClick={handleSalvar}>
                            {loading ? "Salvando…" : "Salvar"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
