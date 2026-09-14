"use client";

import { DIAS, cruzaMeiaNoite, faixaPadrao, timeInputClass, type Faixa } from "./turma-tipos";

interface Props {
    faixas: Faixa[];
    onChange: (faixas: Faixa[]) => void;
    disabled?: boolean;
    max?: number;
}

/** Lista de faixas de horário: dias da semana + início/fim. As regras (sobreposição etc.) vêm do preview da API. */
export default function FaixasHorarioEditor({ faixas, onChange, disabled, max = 10 }: Props) {
    const atualizar = (idx: number, parcial: Partial<Faixa>) =>
        onChange(faixas.map((f, i) => (i === idx ? { ...f, ...parcial } : f)));

    const alternarDia = (idx: number, dia: number) =>
        atualizar(idx, { dias: faixas[idx].dias.map((v, d) => (d === dia ? !v : v)) });

    return (
        <div className="space-y-3">
            {faixas.map((faixa, idx) => (
                <div
                    key={idx}
                    className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                    data-testid={`faixa-${idx}`}
                >
                    <div className="flex flex-wrap items-center gap-1.5">
                        {DIAS.map((nome, dia) => {
                            const ativo = faixa.dias[dia];
                            return (
                                <button
                                    key={nome}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={ativo}
                                    onClick={() => alternarDia(idx, dia)}
                                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                        ativo
                                            ? "bg-brand-500 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-400"
                                    } disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                    {nome}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            disabled={disabled || faixas.length <= 1}
                            onClick={() => onChange(faixas.filter((_, i) => i !== idx))}
                            className="ml-auto rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-error-50 hover:text-error-600 disabled:opacity-40 dark:hover:bg-error-500/10"
                            aria-label={`Remover faixa ${idx + 1}`}
                        >
                            Remover
                        </button>
                    </div>

                    <div className="mt-3 grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span>das</span>
                        <input
                            type="time"
                            value={faixa.inicio}
                            disabled={disabled}
                            onChange={(e) => atualizar(idx, { inicio: e.target.value })}
                            className={timeInputClass}
                            aria-label={`Início da faixa ${idx + 1}`}
                        />
                        <span>às</span>
                        <input
                            type="time"
                            value={faixa.fim}
                            disabled={disabled}
                            onChange={(e) => atualizar(idx, { fim: e.target.value })}
                            className={timeInputClass}
                            aria-label={`Fim da faixa ${idx + 1}`}
                        />
                    </div>

                    {cruzaMeiaNoite(faixa) && faixa.inicio !== faixa.fim && (
                        <p className="mt-2 text-xs text-warning-600 dark:text-warning-400">
                            Esta faixa cruza a meia-noite: termina às {faixa.fim} do dia seguinte.
                        </p>
                    )}
                </div>
            ))}

            <button
                type="button"
                disabled={disabled || faixas.length >= max}
                onClick={() => onChange([...faixas, faixaPadrao()])}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-40 dark:text-brand-400"
            >
                + Adicionar faixa
            </button>
        </div>
    );
}
