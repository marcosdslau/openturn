"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/context/TenantContext";
import ReprocessarPeriodoModal from "./ReprocessarPeriodoModal";

interface Props {
    onClose: () => void;
    onReprocessarSuccess?: () => void;
}

export default function RegistrosManutencaoModal({ onClose, onReprocessarSuccess }: Props) {
    const router = useRouter();
    const { codigoInstituicao } = useTenant();
    const [showReprocessar, setShowReprocessar] = useState(false);

    const irParaManutencao = () => {
        onClose();
        router.push(`/instituicao/${codigoInstituicao}/registros/manutencao`);
    };

    if (showReprocessar) {
        return (
            <ReprocessarPeriodoModal
                onClose={() => setShowReprocessar(false)}
                onSuccess={() => {
                    setShowReprocessar(false);
                    onClose();
                    onReprocessarSuccess?.();
                }}
            />
        );
    }

    return (
        <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Manutenção</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    <button
                        type="button"
                        onClick={() => setShowReprocessar(true)}
                        className="flex w-full items-start gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                            <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-white">Reprocessar Período</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Apaga RPDs do intervalo e reagrega passagens conforme modo atual.
                            </p>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={irParaManutencao}
                        className="flex w-full items-start gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/30">
                            <svg className="h-5 w-5 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-white">Manutenção de Registros</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Criar ou corrigir registros ausentes/incorretos.
                            </p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}
