"use client";

import { useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/context/ToastContext";
import { apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";

interface Props {
    rpdCodigo: number;
    nomePessoa: string;
    dataRegistro: string;
    onClose: () => void;
    onSuccess: () => void;
}

function formatDateBr(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function ConfirmDeleteRegistroModal({
    rpdCodigo,
    nomePessoa,
    dataRegistro,
    onClose,
    onSuccess,
}: Props) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleExcluir = async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            await apiDelete(`/instituicao/${codigoInstituicao}/registro-diario/${rpdCodigo}`);
            showToast("success", "Registro excluído", "O registro foi removido com sucesso.");
            onSuccess();
            onClose();
        } catch (err: any) {
            showToast("error", "Erro ao excluir", err.message || "Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl dark:bg-gray-900">
                <div className="p-6 space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                        <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                        </svg>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Excluir registro?</h3>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            O registro de <strong>{nomePessoa}</strong> em{" "}
                            <strong>{formatDateBr(dataRegistro)}</strong> será excluído permanentemente.
                            Esta ação não pode ser desfeita.
                        </p>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <Button
                            size="sm"
                            onClick={handleExcluir}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                        >
                            {loading ? "Excluindo…" : "Excluir"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={onClose} disabled={loading}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
