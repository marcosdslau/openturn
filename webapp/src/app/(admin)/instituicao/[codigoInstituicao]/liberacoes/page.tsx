"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPost } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/context/ToastContext";
import Button from "@/components/ui/button/Button";
import { RefreshIcon } from "@/icons";

interface EquipamentoVisitante {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
}

type RowState = "idle" | "loading" | "countdown";

const COUNTDOWN_SECONDS = 5;

function formatMarcaModelo(marca: string | null, modelo: string | null): string {
    const parts = [marca, modelo].filter((p) => p && p.trim().length > 0);
    return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function LiberacoesPage() {
    const { codigoInstituicao } = useTenant();
    const { can } = usePermissions();
    const { showToast } = useToast();
    const mayExecute = can("visitante", "execute");

    const [equipamentos, setEquipamentos] = useState<EquipamentoVisitante[]>([]);
    const [loading, setLoading] = useState(true);
    const [rowStates, setRowStates] = useState<Record<number, RowState>>({});
    const [countdowns, setCountdowns] = useState<Record<number, number>>({});
    const timersRef = useRef<Record<number, ReturnType<typeof setInterval>>>({});

    const load = useCallback(async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const data = await apiGet<EquipamentoVisitante[]>(
                `/instituicao/${codigoInstituicao}/visitante/equipamentos`,
            );
            setEquipamentos(Array.isArray(data) ? data : []);
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Não foi possível carregar os equipamentos.";
            showToast("error", "Erro ao carregar", message);
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, showToast]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        return () => {
            Object.values(timersRef.current).forEach(clearInterval);
        };
    }, []);

    const clearTimer = (eqpCodigo: number) => {
        const timer = timersRef.current[eqpCodigo];
        if (timer) {
            clearInterval(timer);
            delete timersRef.current[eqpCodigo];
        }
    };

    const setRowState = (eqpCodigo: number, state: RowState) => {
        setRowStates((prev) => ({ ...prev, [eqpCodigo]: state }));
    };

    const startCountdown = (eqpCodigo: number) => {
        clearTimer(eqpCodigo);
        setCountdowns((prev) => ({ ...prev, [eqpCodigo]: COUNTDOWN_SECONDS }));
        setRowState(eqpCodigo, "countdown");

        const timer = setInterval(() => {
            setCountdowns((prev) => {
                const current = prev[eqpCodigo] ?? 0;
                if (current <= 1) {
                    clearTimer(eqpCodigo);
                    setRowState(eqpCodigo, "idle");
                    const next = { ...prev };
                    delete next[eqpCodigo];
                    return next;
                }
                return { ...prev, [eqpCodigo]: current - 1 };
            });
        }, 1000);

        timersRef.current[eqpCodigo] = timer;
    };

    const handleLiberar = async (equipamento: EquipamentoVisitante) => {
        const { EQPCodigo } = equipamento;
        const current = rowStates[EQPCodigo] ?? "idle";
        if (current !== "idle" || !mayExecute) return;

        setRowState(EQPCodigo, "loading");

        try {
            await apiPost<{ ok: boolean }>(
                `/instituicao/${codigoInstituicao}/hardware/${EQPCodigo}/open-gate`,
                {},
            );
            showToast("success", "Catraca liberada", "A catraca está liberada.");
            startCountdown(EQPCodigo);
        } catch (error: unknown) {
            setRowState(EQPCodigo, "idle");
            const message =
                error instanceof Error ? error.message : "Não foi possível liberar a catraca.";
            showToast("error", "Erro ao liberar", message);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
                    Liberações
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Selecione o equipamento e libere a catraca.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <RefreshIcon className="h-8 w-8 animate-spin text-brand-500" aria-hidden />
                </div>
            ) : equipamentos.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                    Nenhum equipamento ativo encontrado.
                </div>
            ) : (
                <ul className="flex flex-col gap-4">
                    {equipamentos.map((eqp) => {
                        const state = rowStates[eqp.EQPCodigo] ?? "idle";
                        const countdown = countdowns[eqp.EQPCodigo];
                        const isLoading = state === "loading";
                        const isCountdown = state === "countdown";

                        return (
                            <li
                                key={eqp.EQPCodigo}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xl font-semibold text-gray-800 dark:text-white/90 md:text-2xl">
                                        {eqp.EQPDescricao?.trim() || `Equipamento #${eqp.EQPCodigo}`}
                                    </p>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        {formatMarcaModelo(eqp.EQPMarca, eqp.EQPModelo)}
                                    </p>
                                </div>

                                <div className="flex shrink-0 min-w-[8.25rem] items-center justify-center">
                                    {isCountdown && countdown != null && countdown > 0 ? (
                                        <span
                                            className="flex size-[4.125rem] items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-white"
                                            aria-label={`${countdown} segundos restantes`}
                                        >
                                            {countdown}
                                        </span>
                                    ) : mayExecute ? (
                                        <Button
                                            size="md"
                                            variant="primary"
                                            disabled={isLoading}
                                            onClick={() => handleLiberar(eqp)}
                                            className="min-w-[7.5rem] px-6 py-3.5 text-base font-medium"
                                        >
                                            {isLoading ? (
                                                <span className="inline-flex items-center gap-2">
                                                    <RefreshIcon className="h-4 w-4 animate-spin" />
                                                    Liberando…
                                                </span>
                                            ) : (
                                                "Liberar"
                                            )}
                                        </Button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
