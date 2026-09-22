"use client";

import {
    DIAS_CURTOS,
    corDaArea,
    hhmmDeSegundos,
    liberadoPorArea,
    portalDeEntrada,
    type AreaItem,
    type DepartamentoItem,
    type HorarioItem,
    type Intervalo,
    type PortalItem,
} from "./acesso-tipos";

interface Props {
    departamento: DepartamentoItem;
    areas: AreaItem[];
    portais: PortalItem[];
    horarios: HorarioItem[];
}

/** Segunda a domingo — a API usa domingo = 0. */
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const MARCAS_HORA = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const LISTRA_BLOQUEIO = "repeating-linear-gradient(135deg, rgba(240,68,56,.18) 0 4px, transparent 4px 8px)";

const fmt = (min: number) => (min >= 1440 ? "24:00" : hhmmDeSegundos(min * 60));
const fmtIntervalo = ([i, f]: Intervalo) => `${fmt(i)}–${fmt(f)}`;

/**
 * O que um departamento libera, por área.
 *
 * Generaliza o diagrama de dois sentidos (Interna/Externa) para N áreas: cada área é uma linha com
 * o portal que dá entrada nela e a grade semanal dos minutos liberados. Área sem regra aparece
 * hachurada — no modelo allow-only, ausência de regra é bloqueio.
 */
export default function DiagramaAcesso({ departamento, areas, portais, horarios }: Props) {
    const porArea = liberadoPorArea(departamento, horarios);
    const horarioPorCodigo = new Map(horarios.map((h) => [h.HORCodigo, h]));

    return (
        <div className="space-y-5" data-testid="diagrama-acesso">
            <div className="space-y-2">
                {areas.map((area, idx) => {
                    const cor = corDaArea(idx);
                    const portal = portalDeEntrada(portais, area.ARECodigo);
                    const regras = departamento.regras.filter((r) => r.areas.includes(area.ARECodigo));
                    const liberado = porArea.get(area.ARECodigo);
                    const temAlgo = !!liberado?.some((d) => d.length);

                    return (
                        <div
                            key={area.ARECodigo}
                            className={`rounded-xl border-l-4 border-y border-r border-gray-200 px-3 py-2 dark:border-gray-800 ${
                                temAlgo ? cor.borda : "border-l-gray-300 dark:border-l-gray-700"
                            }`}
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                    Entrada na área {area.ARENome}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {portal ? (
                                        <>
                                            por <span className="font-mono">{portal.PTLNome}</span> (#{portal.PTLIdDevice})
                                        </>
                                    ) : (
                                        <span className="text-warning-600">sem portal — nenhuma regra vale aqui</span>
                                    )}
                                </p>
                            </div>
                            {temAlgo ? (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {regras.map((r) => (
                                        <span key={r.DRGCodigo} className={`rounded px-1.5 py-0.5 text-xs ${cor.chip}`}>
                                            {horarioPorCodigo.get(r.HORCodigo)?.HORNome ?? `#${r.HORCodigo}`}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-1 text-xs text-gray-400">
                                    Bloqueado — ninguém deste departamento entra nesta área.
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div>
                <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
                    <span />
                    <div className="relative mb-1 h-4 text-[10px] text-gray-400">
                        {MARCAS_HORA.map((h) => (
                            <span
                                key={h}
                                className={`absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full ${h % 6 ? "hidden sm:inline" : ""}`}
                                style={{ left: `${(h / 24) * 100}%` }}
                            >
                                {h}h
                            </span>
                        ))}
                    </div>
                    {ORDEM_DIAS.map((dia, idx) => (
                        <div key={dia} className="contents">
                            <span className="self-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                {DIAS_CURTOS[dia]}
                            </span>
                            <div
                                className={`relative space-y-0.5 py-1 ${
                                    idx < ORDEM_DIAS.length - 1 ? "border-b border-gray-100 dark:border-gray-800" : ""
                                }`}
                            >
                                {MARCAS_HORA.slice(1, -1).map((h) => (
                                    <span
                                        key={h}
                                        aria-hidden
                                        className={`pointer-events-none absolute inset-y-0 z-10 w-px ${
                                            h % 6 === 0 ? "bg-gray-300/70 dark:bg-white/15" : "bg-gray-200/60 dark:bg-white/[0.06]"
                                        }`}
                                        style={{ left: `${(h / 24) * 100}%` }}
                                    />
                                ))}
                                {areas.map((area, i) => {
                                    const cor = corDaArea(i);
                                    const intervalos = porArea.get(area.ARECodigo)?.[dia] ?? [];
                                    const titulo = `${DIAS_CURTOS[dia]} · entrada na área ${area.ARENome}: ${
                                        intervalos.length ? intervalos.map(fmtIntervalo).join(", ") : "bloqueado"
                                    }`;
                                    return (
                                        <div
                                            key={area.ARECodigo}
                                            className="relative h-3 overflow-hidden rounded-sm bg-gray-100 dark:bg-white/[0.06]"
                                            style={intervalos.length ? undefined : { backgroundImage: LISTRA_BLOQUEIO }}
                                            title={titulo}
                                        >
                                            {intervalos.map((iv) => (
                                                <div
                                                    key={`${iv[0]}-${iv[1]}`}
                                                    className={`absolute inset-y-0 ${cor.barra}`}
                                                    style={{
                                                        left: `${(iv[0] / 1440) * 100}%`,
                                                        width: `${((iv[1] - iv[0]) / 1440) * 100}%`,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {areas.map((a, i) => (
                        <span key={a.ARECodigo} className="inline-flex items-center gap-1.5">
                            <span className={`inline-block h-2.5 w-4 rounded-sm ${corDaArea(i).barra}`} />
                            entrada em {a.ARENome}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5">
                        <span
                            className="inline-block h-2.5 w-4 rounded-sm bg-gray-100 dark:bg-white/[0.06]"
                            style={{ backgroundImage: LISTRA_BLOQUEIO }}
                        />
                        bloqueado
                    </span>
                </div>
            </div>
        </div>
    );
}
