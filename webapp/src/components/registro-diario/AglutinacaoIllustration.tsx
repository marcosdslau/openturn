"use client";

import React from "react";
import type { TipoAglutinacaoRegistro, PeriodoRegistro } from "./aglutinacao-types";

interface Props {
    tipo: TipoAglutinacaoRegistro;
    periodos?: PeriodoRegistro[];
}

function timeToPercent(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return ((h * 60 + m) / 1440) * 100;
}

interface BarProps {
    left: number;
    width: number;
    color?: string;
    label?: string;
}

function Bar({ left, width, color = "bg-brand-500/70", label }: BarProps) {
    return (
        <div
            className={`absolute top-1/2 -translate-y-1/2 h-4 rounded ${color}`}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
            title={label}
        />
    );
}

const PLACEHOLDER_PERIODOS: PeriodoRegistro[] = [
    { PERNome: "Manhã",  PERHorarioInicio: "05:00", PERHorarioFim: "12:00", PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
    { PERNome: "Tarde",  PERHorarioInicio: "12:01", PERHorarioFim: "18:00", PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
    { PERNome: "Noite",  PERHorarioInicio: "18:01", PERHorarioFim: "23:59", PERToleranciaEntradaMinutos: 0, PERToleranciaSaidaMinutos: 0 },
];

const PERIODO_COLORS = [
    { bg: "bg-brand-100 dark:bg-brand-900/30",   bar: "bg-brand-500/80" },
    { bg: "bg-violet-100 dark:bg-violet-900/30", bar: "bg-violet-500/80" },
    { bg: "bg-amber-100 dark:bg-amber-900/30",   bar: "bg-amber-500/80" },
    { bg: "bg-emerald-100 dark:bg-emerald-900/30", bar: "bg-emerald-500/80" },
];

const PO_WINDOWS = [
    { e: "07:00", s: "08:50" },
    { e: "09:00", s: "12:35" },
    { e: "13:00", s: "14:50" },
    { e: "15:00", s: "17:02" },
    { e: "17:03", s: "20:36" },
];

const PERIOD_BARS: Record<string, { e: string; s: string }> = {
    "Manhã":  { e: "07:00", s: "12:35" },
    "Tarde":  { e: "13:00", s: "17:02" },
    "Noite":  { e: "17:30", s: "20:36" },
};

export default function AglutinacaoIllustration({ tipo, periodos = [] }: Props) {
    return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 p-4">
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Dia (00:00 – 24:00)
            </p>

            {tipo === "entrada_saida" && (
                <div className="relative h-8">
                    <div className="absolute inset-0 top-1/2 -translate-y-1/2 h-2 rounded bg-gray-200 dark:bg-gray-700 my-auto" style={{ top: "50%" }} />
                    <Bar
                        left={timeToPercent("07:00")}
                        width={timeToPercent("20:36") - timeToPercent("07:00")}
                        color="bg-brand-500/70"
                        label="07:00 – 20:36"
                    />
                </div>
            )}

            {tipo === "tempo_permanencia" && (
                <div className="relative h-8">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded bg-gray-200 dark:bg-gray-700" />
                    {PO_WINDOWS.map((w, i) => (
                        <Bar
                            key={i}
                            left={timeToPercent(w.e)}
                            width={timeToPercent(w.s) - timeToPercent(w.e)}
                            color={i % 2 === 0 ? "bg-brand-500/70" : "bg-brand-400/50"}
                            label={`${w.e} – ${w.s}`}
                        />
                    ))}
                </div>
            )}

            {tipo === "tempo_permanencia_periodo" && (
                <div className="relative h-8">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded bg-gray-200 dark:bg-gray-700" />
                    {(periodos.length > 0 ? periodos : PLACEHOLDER_PERIODOS).map((p, i) => {
                        const colorSet = PERIODO_COLORS[i % PERIODO_COLORS.length];
                        const left = timeToPercent(p.PERHorarioInicio);
                        const right = timeToPercent(p.PERHorarioFim);
                        const width = right - left;
                        const barData = PERIOD_BARS[p.PERNome] ?? { e: p.PERHorarioInicio, s: p.PERHorarioFim };
                        const barLeft = timeToPercent(barData.e);
                        const barWidth = timeToPercent(barData.s) - barLeft;
                        return (
                            <React.Fragment key={p.PERNome + i}>
                                <div
                                    className={`absolute top-1/2 -translate-y-1/2 h-6 rounded ${colorSet.bg}`}
                                    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                                    title={p.PERNome}
                                />
                                {barWidth > 0 && (
                                    <Bar
                                        left={barLeft}
                                        width={barWidth}
                                        color={colorSet.bar}
                                        label={`${p.PERNome}: ${barData.e} – ${barData.s}`}
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            <LegendRow tipo={tipo} periodos={periodos.length > 0 ? periodos : PLACEHOLDER_PERIODOS} />
        </div>
    );
}

function LegendRow({ tipo, periodos }: { tipo: TipoAglutinacaoRegistro; periodos: PeriodoRegistro[] }) {
    if (tipo === "entrada_saida") {
        return (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Menor entrada · Maior saída do dia
            </p>
        );
    }
    if (tipo === "tempo_permanencia") {
        return (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Cada ciclo entrada→saída forma uma janela separada
            </p>
        );
    }
    return (
        <div className="mt-3 flex flex-wrap gap-3">
            {periodos.map((p, i) => {
                const colorSet = PERIODO_COLORS[i % PERIODO_COLORS.length];
                return (
                    <span key={p.PERNome + i} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${colorSet.bar}`} />
                        {p.PERNome} ({p.PERHorarioInicio}–{p.PERHorarioFim})
                    </span>
                );
            })}
        </div>
    );
}
