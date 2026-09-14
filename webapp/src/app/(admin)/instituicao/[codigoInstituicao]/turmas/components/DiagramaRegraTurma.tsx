"use client";

import {
    DIAS,
    MODO_INFO,
    SENTIDO_INFO,
    SENTIDOS,
    diferencaIntervalos,
    horaDeMinutos,
    intervalosDoDia,
    resumirDias,
    type CanonicoRegras,
    type Intervalo,
    type RegraCanonica,
    type Sentido,
} from "./turma-tipos";

/** Cor fixa por área de destino — a mesma na seta, na caixa da área e na faixa da grade semanal. */
export const COR_SENTIDO: Record<Sentido, { barra: string; texto: string; borda: string; chip: string; suave: string }> = {
    interna: {
        barra: "bg-brand-500",
        texto: "text-brand-600 dark:text-brand-400",
        borda: "border-brand-500/70",
        chip: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
        suave: "bg-brand-50/60 dark:bg-brand-500/[0.07]",
    },
    externa: {
        barra: "bg-orange-500",
        texto: "text-orange-600 dark:text-orange-400",
        borda: "border-orange-500/70",
        chip: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
        suave: "bg-orange-50/60 dark:bg-orange-500/[0.07]",
    },
};

/** Segunda a domingo (a API usa domingo = 0). */
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const MARCAS_HORA = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const LISTRA_BLOQUEIO = "repeating-linear-gradient(135deg, rgba(240,68,56,.18) 0 4px, transparent 4px 8px)";

const fmtIntervalo = ([i, f]: Intervalo) => `${horaDeMinutos(i)}–${f >= 1440 ? "24:00" : horaDeMinutos(f)}`;

/** "Seg–Sex 06:30–07:30 e 12:50–13:10 · Sáb 07:00–08:00" a partir da forma canônica. */
export function resumirCanonico(regra: RegraCanonica): string[] {
    if (regra.modo !== "horario" || !regra.dias) return [MODO_INFO[regra.modo].rotulo];
    const grupos = new Map<string, { dias: boolean[]; intervalos: Intervalo[] }>();
    for (const d of ORDEM_DIAS) {
        const intervalos = regra.dias[d] ?? [];
        if (!intervalos.length) continue;
        const chave = JSON.stringify(intervalos);
        const g = grupos.get(chave) ?? { dias: [false, false, false, false, false, false, false], intervalos };
        g.dias[d] = true;
        grupos.set(chave, g);
    }
    if (!grupos.size) return ["Nenhum horário"];
    return [...grupos.values()].map((g) => `${resumirDias(g.dias)} ${g.intervalos.map(fmtIntervalo).join(" e ")}`);
}

function IconeArea({ sentido }: { sentido: Sentido }) {
    return sentido === "interna" ? (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path d="M3 10.5 12 4l9 6.5M5 9v11h14V9M10 20v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function CaixaArea({ sentido }: { sentido: Sentido }) {
    const cor = COR_SENTIDO[sentido];
    return (
        <div
            className={`flex h-full flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-4 text-center ${cor.borda} ${cor.suave} ${sentido === "interna" ? "order-2 @2xl:order-3" : "order-1"}`}
        >
            <span className={cor.texto}>
                <IconeArea sentido={sentido} />
            </span>
            <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {sentido === "interna" ? "Área Interna" : "Área Externa"}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{sentido === "interna" ? "dentro da escola" : "fora da escola"}</span>
        </div>
    );
}

function Seta({ sentido, regra, divergente }: { sentido: Sentido; regra: RegraCanonica; divergente: boolean }) {
    const cor = COR_SENTIDO[sentido];
    const info = SENTIDO_INFO[sentido];
    const bloqueado = regra.modo === "bloqueado";
    const paraDireita = sentido === "interna"; // Externa (esquerda) → Interna (direita)
    const ponta = (
        <svg viewBox="0 0 10 12" className={`h-3 w-2.5 shrink-0 ${bloqueado ? "text-error-400" : cor.texto}`} aria-hidden>
            <path d={paraDireita ? "M0 0 10 6 0 12z" : "M10 0 0 6 10 12z"} fill="currentColor" />
        </svg>
    );
    return (
        <div className="space-y-1.5" data-testid={`seta-${sentido}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className={`font-semibold ${cor.texto}`}>{info.titulo}</span>
                <span className="text-gray-400">{info.fluxo}</span>
            </div>
            <div className="relative flex items-center" aria-hidden>
                {!paraDireita && ponta}
                <div className={`flex-1 ${bloqueado ? "border-t-2 border-dashed border-error-400" : `h-[3px] rounded ${cor.barra}`}`} />
                {paraDireita && ponta}
                {bloqueado && (
                    <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white px-1.5 text-xs font-bold text-error-500 dark:bg-gray-900">
                        ✕
                    </span>
                )}
            </div>
            <div
                className={`rounded-lg px-2.5 py-1.5 text-xs ${bloqueado ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400" : cor.chip} ${
                    divergente ? "ring-2 ring-error-400" : ""
                }`}
            >
                {resumirCanonico(regra).map((linha) => (
                    <p key={linha}>{linha}</p>
                ))}
            </div>
        </div>
    );
}

function Faixa({
    sentido,
    regra,
    referencia,
    dia,
}: {
    sentido: Sentido;
    regra: RegraCanonica;
    referencia?: RegraCanonica | null;
    dia: number;
}) {
    const cor = COR_SENTIDO[sentido];
    const intervalos = intervalosDoDia(regra, dia);
    const esperados = referencia ? intervalosDoDia(referencia, dia) : [];
    const diferencas = referencia ? diferencaIntervalos(intervalos, esperados) : [];
    // Parte da diferença que o configurado libera e aqui não: contorno tracejado no lugar vazio.
    const faltando = diferencas.filter(([i, f]) => esperados.some(([ei, ef]) => i >= ei && f <= ef));
    const pos = ([i, f]: Intervalo) => ({ left: `${(i / 1440) * 100}%`, width: `${((f - i) / 1440) * 100}%` });
    const titulo = `${DIAS[dia]} · ${SENTIDO_INFO[sentido].titulo}: ${
        regra.modo === "horario" ? intervalos.map(fmtIntervalo).join(", ") || "sem horário" : MODO_INFO[regra.modo].rotulo
    }`;
    return (
        <div>
            <div
                className="relative h-3 overflow-hidden rounded-sm bg-gray-100 dark:bg-white/[0.06]"
                style={regra.modo === "bloqueado" ? { backgroundImage: LISTRA_BLOQUEIO } : undefined}
                title={titulo}
            >
                {intervalos.map((iv) => (
                    <div key={`${iv[0]}-${iv[1]}`} className={`absolute inset-y-0 ${cor.barra} ${regra.modo === "livre" ? "opacity-70" : ""}`} style={pos(iv)} />
                ))}
                {faltando.map((iv) => (
                    <div key={`f-${iv[0]}-${iv[1]}`} className="absolute inset-y-0 rounded-sm border border-dashed border-error-500" style={pos(iv)} />
                ))}
            </div>
            {referencia && (
                <div className="relative mt-px h-1" aria-hidden={!diferencas.length}>
                    {diferencas.map((iv) => (
                        <div
                            key={`d-${iv[0]}-${iv[1]}`}
                            className="absolute inset-y-0 rounded-full bg-error-500"
                            style={pos(iv)}
                            title={`${DIAS[dia]} ${fmtIntervalo(iv)}: diferente do configurado`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface Props {
    canonico: CanonicoRegras;
    /** Quando informado (ex.: configuração salva), destaca em vermelho o que difere dele. */
    referencia?: CanonicoRegras | null;
    /** Nó central: turma e departamento que carregam a regra. */
    turma?: { rotulo: string; perfil?: string | null; pessoas?: number | null; extra?: string | null };
    /** Oculta o fluxo entre áreas e mostra só a grade semanal. */
    somenteGrade?: boolean;
}

/**
 * Diagrama da regra de uma turma: Área Externa ⇄ catraca ⇄ Área Interna, com o que vale em cada
 * sentido, e a grade semanal (seg–dom × 24 h) dos minutos liberados por sentido.
 */
export default function DiagramaRegraTurma({ canonico, referencia, turma, somenteGrade }: Props) {
    const divergente = (s: Sentido) =>
        !!referencia && JSON.stringify(canonico[s]) !== JSON.stringify(referencia[s]);

    return (
        <div className="@container space-y-5" data-testid="diagrama-regra-turma">
            {!somenteGrade && (
                <div
                    className="grid grid-cols-2 gap-3 @2xl:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem] @2xl:gap-4"
                >
                    <CaixaArea sentido="externa" />
                    <div className="order-3 col-span-2 flex flex-col justify-center gap-3 @2xl:order-2 @2xl:col-span-1">
                        <Seta sentido="interna" regra={canonico.interna} divergente={divergente("interna")} />
                        {turma && (
                            <div className="mx-auto flex max-w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900">
                                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M12 3v6M12 15v6M4.2 7.5l5.2 3M14.6 13.5l5.2 3M4.2 16.5l5.2-3M14.6 10.5l5.2-3" strokeLinecap="round" />
                                </svg>
                                <div className="min-w-0 text-xs leading-tight">
                                    <p className="truncate font-semibold text-gray-800 dark:text-white/90">{turma.rotulo}</p>
                                    <p className="truncate text-gray-500 dark:text-gray-400">
                                        {[turma.perfil ? `Departamento ${turma.perfil}` : null, turma.pessoas != null ? `${turma.pessoas} pessoa(s)` : null, turma.extra]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </p>
                                </div>
                            </div>
                        )}
                        <Seta sentido="externa" regra={canonico.externa} divergente={divergente("externa")} />
                    </div>
                    <CaixaArea sentido="interna" />
                </div>
            )}

            <div>
                <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
                    <span />
                    <div className="relative mb-1 h-4 text-[10px] text-gray-400">
                        {MARCAS_HORA.map((h) => (
                            <span
                                key={h}
                                className={`absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full ${h % 6 ? "hidden @md:inline" : ""}`}
                                style={{ left: `${(h / 24) * 100}%` }}
                            >
                                {h}h
                            </span>
                        ))}
                    </div>
                    {ORDEM_DIAS.map((dia, idx) => (
                        <div key={dia} className="contents">
                            <span className="self-center text-xs font-medium text-gray-500 dark:text-gray-400">{DIAS[dia]}</span>
                            <div className={`relative space-y-0.5 py-1 ${idx < ORDEM_DIAS.length - 1 ? "border-b border-gray-100 dark:border-gray-800" : ""}`}>
                                {MARCAS_HORA.slice(1, -1).map((h) => (
                                    <span
                                        key={h}
                                        aria-hidden
                                        className={`pointer-events-none absolute inset-y-0 z-10 w-px ${h % 6 === 0 ? "bg-gray-300/70 dark:bg-white/15" : "bg-gray-200/60 dark:bg-white/[0.06]"}`}
                                        style={{ left: `${(h / 24) * 100}%` }}
                                    />
                                ))}
                                {SENTIDOS.map((s) => (
                                    <Faixa key={s} sentido={s} regra={canonico[s]} referencia={referencia?.[s]} dia={dia} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {SENTIDOS.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1.5">
                            <span className={`inline-block h-2.5 w-4 rounded-sm ${COR_SENTIDO[s].barra}`} />
                            {SENTIDO_INFO[s].titulo} ({SENTIDO_INFO[s].curto.toLowerCase()})
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-4 rounded-sm bg-gray-100 dark:bg-white/[0.06]" style={{ backgroundImage: LISTRA_BLOQUEIO }} />
                        Bloqueado
                    </span>
                    {referencia && (
                        <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex h-2.5 w-4 flex-col justify-end">
                                <span className="h-1 rounded-full bg-error-500" />
                            </span>
                            Diferente do configurado (tracejado: horário que falta)
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
