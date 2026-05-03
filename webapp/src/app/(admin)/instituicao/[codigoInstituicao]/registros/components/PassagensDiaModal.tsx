"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/context/ToastContext";

interface Passagem {
    REGCodigo: number;
    REGAcao: string;
    REGDataHora: string;
    equipamento: { EQPDescricao: string | null };
}

interface Meta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface PassagensDiaModalProps {
    isOpen: boolean;
    onClose: () => void;
    PESCodigo: number;
    /** ISO da data do registro diário (RPDData). */
    RPDData: string;
    nomePessoa: string;
}

/** Limites do dia em UTC alinhados ao armazenamento de RPDData (meia-noite UTC). */
function boundsUtcDiaRpd(rpdDataIso: string): { dataInicio: string; dataFim: string } {
    const d = new Date(rpdDataIso);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
    return { dataInicio: start.toISOString(), dataFim: end.toISOString() };
}

function formatDateBr(iso: string) {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function PassagensDiaModal({
    isOpen,
    onClose,
    PESCodigo,
    RPDData,
    nomePessoa,
}: PassagensDiaModalProps) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [passagens, setPassagens] = useState<Passagem[]>([]);

    const load = useCallback(async () => {
        if (!codigoInstituicao || !isOpen) return;
        setLoading(true);
        setPassagens([]);
        try {
            const { dataInicio, dataFim } = boundsUtcDiaRpd(RPDData);
            const all: Passagem[] = [];
            let page = 1;
            const limit = 100;
            let totalPages = 1;
            do {
                const params = new URLSearchParams({
                    page: String(page),
                    limit: String(limit),
                    PESCodigo: String(PESCodigo),
                    dataInicio,
                    dataFim,
                });
                const res = await apiGet<{ data: Passagem[]; meta: Meta }>(
                    `/instituicao/${codigoInstituicao}/passagem?${params}`,
                );
                all.push(...(res.data || []));
                totalPages = res.meta?.totalPages ?? 1;
                page += 1;
                if (page > 60) break;
            } while (page <= totalPages);

            all.sort((a, b) => new Date(a.REGDataHora).getTime() - new Date(b.REGDataHora).getTime());
            setPassagens(all);
        } catch (e: any) {
            showToast("error", "Erro ao carregar passagens", e?.message || "Tente novamente.");
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, isOpen, PESCodigo, RPDData, showToast]);

    useEffect(() => {
        if (isOpen) load();
    }, [isOpen, load]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl p-6 sm:p-8">
            <div className="space-y-4 pr-8">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Passagens do dia
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {nomePessoa} · {formatDateBr(RPDData)}
                    </p>
                </div>

                <div className="max-h-[min(60vh,480px)] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/90 z-10">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    Data/Hora
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    Ação
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    Equipamento
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                                        Carregando...
                                    </td>
                                </tr>
                            ) : passagens.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                                        Nenhuma passagem neste dia.
                                    </td>
                                </tr>
                            ) : (
                                passagens.map((p) => (
                                    <tr key={p.REGCodigo} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                                        <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                            {new Date(p.REGDataHora).toLocaleString("pt-BR")}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    p.REGAcao === "ENTRADA"
                                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                }`}
                                            >
                                                {p.REGAcao === "ENTRADA" ? "Entrada" : "Saída"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                                            {p.equipamento?.EQPDescricao || "—"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
}
