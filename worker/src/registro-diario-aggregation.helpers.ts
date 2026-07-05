import { AcaoPassagem } from '@prisma/client';

// ---------------------------------------------------------------------------
// Tipos base
// ---------------------------------------------------------------------------

/** Linhas mínimas de REGRegistroPassagem para agregação em RPD (worker). */
export type PassagemParaAgregacao = {
    REGCodigo: number;
    PESCodigo: number;
    REGDataHora: Date;
    REGAcao: AcaoPassagem;
};

/** Período de captura lido de PERPeriodosConfig. */
export type PeriodoConfig = {
    PERCodigo: number;
    PERHorarioInicio: string;
    PERHorarioFim: string;
    PERToleranciaEntradaMinutos: number;
    PERToleranciaSaidaMinutos: number;
};

/** Uma janela de presença gerada por qualquer estratégia de agregação. */
export type JanelaAgregada = {
    PESCodigo: number;
    /**
     * Meio-dia UTC do dia civil de REGDataHora (componentes UTC).
     * Não aplicar fuso da instituição: REGDataHora já está em UTC no banco.
     * Meio-dia evita coluna DATE no PG virar o dia anterior em sessão America/Sao_Paulo.
     */
    dataLocal: Date;
    RPDJanelaIndice: number;
    RPDDataEntrada: Date | null;
    RPDDataSaida: Date | null;
    /** PERCodigo de origem (modo tempo_permanencia_periodo). null = modo sem período ou janela extra. */
    PERCodigo: number | null;
    /** REGCodigo incluídos nesta janela (para marcar REGProcessado). */
    codigosPassagem: number[];
};

/** Par (PESCodigo, dia UTC) afetado pelas passagens pendentes. */
export type DiaAfetado = {
    PESCodigo: number;
    dataLocal: Date;
    /** Início do dia civil UTC (meia-noite). */
    inicio: Date;
    /** Início do dia seguinte civil UTC (meia-noite). */
    fim: Date;
};

// ---------------------------------------------------------------------------
// Tipo legado — mantido para não quebrar selftests existentes
// ---------------------------------------------------------------------------

export type GrupoAgregacaoDia = {
    PESCodigo: number;
    dataLocal: Date;
    codigos: number[];
    minEntrada: Date | null;
    maxSaida: Date | null;
};

// ---------------------------------------------------------------------------
// Chave de (pessoa, dia UTC)
// ---------------------------------------------------------------------------

/** Constrói chave `"PESCodigo|YYYY-MM-DD"` a partir do calendário UTC de uma data. */
export function personDayKey(pesCodigo: number, regDataHora: Date): string {
    const y = regDataHora.getUTCFullYear();
    const mo = regDataHora.getUTCMonth();
    const day = regDataHora.getUTCDate();
    return `${pesCodigo}|${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Destrói chave gerada por `personDayKey` em `{PESCodigo, dataLocal}`. */
export function parsePersonDayKey(key: string): { PESCodigo: number; dataLocal: Date } {
    const [pes, dateStr] = key.split('|');
    const [y, mo, d] = dateStr.split('-').map(Number);
    return {
        PESCodigo: Number(pes),
        dataLocal: new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0)),
    };
}

// ---------------------------------------------------------------------------
// Agrupamento
// ---------------------------------------------------------------------------

/** Agrupa passagens por chave `(PESCodigo, dia UTC)`. */
export function groupPassagensByPersonDay(
    passagens: PassagemParaAgregacao[],
): Map<string, PassagemParaAgregacao[]> {
    const m = new Map<string, PassagemParaAgregacao[]>();
    for (const p of passagens) {
        const key = personDayKey(p.PESCodigo, p.REGDataHora);
        const arr = m.get(key) ?? [];
        arr.push(p);
        m.set(key, arr);
    }
    return m;
}

/** Agrupa janelas já calculadas por chave `(PESCodigo, dia UTC)` para persistência. */
export function groupJanelasByPersonDay(
    janelas: JanelaAgregada[],
): Map<string, JanelaAgregada[]> {
    const m = new Map<string, JanelaAgregada[]>();
    for (const j of janelas) {
        const key = personDayKey(j.PESCodigo, j.dataLocal);
        const arr = m.get(key) ?? [];
        arr.push(j);
        m.set(key, arr);
    }
    return m;
}

/**
 * Extrai os pares únicos (PESCodigo, dia UTC) das passagens pendentes.
 * Retorna `DiaAfetado[]` com os limites de cada dia para `loadPassagensForDayKeys`.
 */
export function extractAffectedDayKeys(pendentes: PassagemParaAgregacao[]): DiaAfetado[] {
    const seen = new Map<string, DiaAfetado>();
    for (const p of pendentes) {
        const key = personDayKey(p.PESCodigo, p.REGDataHora);
        if (!seen.has(key)) {
            const y = p.REGDataHora.getUTCFullYear();
            const mo = p.REGDataHora.getUTCMonth();
            const day = p.REGDataHora.getUTCDate();
            seen.set(key, {
                PESCodigo: p.PESCodigo,
                dataLocal: new Date(Date.UTC(y, mo, day, 12, 0, 0, 0)),
                inicio: new Date(Date.UTC(y, mo, day, 0, 0, 0, 0)),
                fim: new Date(Date.UTC(y, mo, day + 1, 0, 0, 0, 0)),
            });
        }
    }
    return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Estratégia 1 — entrada_saida (legado / padrão)
// ---------------------------------------------------------------------------

/**
 * Agrega passagens no modo `entrada_saida`: uma janela por (pessoa, dia) com
 * min(ENTRADA) e max(SAIDA). Equivalente ao comportamento histórico.
 */
export function aggregateEntradaSaida(passagens: PassagemParaAgregacao[]): JanelaAgregada[] {
    const groups = buildPassagemDayGroups(passagens);
    return [...groups.values()].map((g) => ({
        PESCodigo: g.PESCodigo,
        dataLocal: g.dataLocal,
        RPDJanelaIndice: 1,
        RPDDataEntrada: g.minEntrada,
        RPDDataSaida: g.maxSaida,
        PERCodigo: null,
        codigosPassagem: g.codigos,
    }));
}

// ---------------------------------------------------------------------------
// Estratégia 2 — tempo_permanencia (state machine)
// ---------------------------------------------------------------------------

type WindowState = {
    entrada: Date | null;
    saida: Date | null;
    codigos: number[];
};

/**
 * State machine de pareamento ENTRADA/SAÍDA sobre passagens já ordenadas cronologicamente.
 * - ENTRADA sem janela aberta → abre nova janela.
 * - ENTRADA com janela aberta (sem SAIDA) → mantém início original (P1-A).
 * - ENTRADA após janela fechada (com SAIDA) → push anterior, abre nova.
 * - SAIDA com janela aberta → extende saída (max).
 * - SAIDA sem janela aberta → janela órfã (P3-B).
 */
function runStateMachine(sorted: PassagemParaAgregacao[]): WindowState[] {
    let current: WindowState | null = null;
    const windows: WindowState[] = [];

    for (const p of sorted) {
        if (p.REGAcao === AcaoPassagem.ENTRADA) {
            if (current && current.saida !== null) {
                windows.push(current);
                current = { entrada: p.REGDataHora, saida: null, codigos: [p.REGCodigo] };
            } else if (!current) {
                current = { entrada: p.REGDataHora, saida: null, codigos: [p.REGCodigo] };
            } else {
                current.codigos.push(p.REGCodigo);
            }
        } else {
            if (current) {
                current.codigos.push(p.REGCodigo);
                if (!current.saida || p.REGDataHora > current.saida) {
                    current.saida = p.REGDataHora;
                }
            } else {
                windows.push({ entrada: null, saida: p.REGDataHora, codigos: [p.REGCodigo] });
            }
        }
    }
    if (current) windows.push(current);

    return windows;
}

/**
 * Agrega passagens no modo `tempo_permanencia`.
 * Aplica state machine sobre passagens ordenadas cronologicamente por (pessoa, dia).
 */
export function aggregateTempoPermanencia(passagens: PassagemParaAgregacao[]): JanelaAgregada[] {
    const byPersonDay = groupPassagensByPersonDay(passagens);
    const result: JanelaAgregada[] = [];

    for (const [key, rows] of byPersonDay) {
        const sorted = [...rows].sort((a, b) => a.REGDataHora.getTime() - b.REGDataHora.getTime());
        const windows = runStateMachine(sorted);

        const { PESCodigo, dataLocal } = parsePersonDayKey(key);
        windows.forEach((w, idx) => {
            result.push({
                PESCodigo,
                dataLocal,
                RPDJanelaIndice: idx + 1,
                RPDDataEntrada: w.entrada,
                RPDDataSaida: w.saida,
                PERCodigo: null,
                codigosPassagem: w.codigos,
            });
        });
    }
    return result;
}

// ---------------------------------------------------------------------------
// Estratégia 3 — tempo_permanencia_periodo
// ---------------------------------------------------------------------------

/** Converte "HH:mm" para minutos desde meia-noite [0, 1440). */
export function hhmmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

/** Range efetivo em minutos, expandido pelas tolerâncias do período. */
export function periodEffectiveRange(p: PeriodoConfig): { start: number; end: number } {
    const start = hhmmToMinutes(p.PERHorarioInicio) - p.PERToleranciaEntradaMinutos;
    const end = hhmmToMinutes(p.PERHorarioFim) + p.PERToleranciaSaidaMinutos;
    return { start, end };
}

/**
 * Converte um timestamp UTC para minutos locais da instituição.
 * `fusoHorario` é o offset UTC em horas (ex.: -3 para BRT).
 * Usado apenas no modo `tempo_permanencia_periodo` para comparar passagens
 * com horários de período expressos no fuso local.
 */
export function toLocalMinutes(regDataHora: Date, fusoHorario: number): number {
    const localMs = regDataHora.getTime() + fusoHorario * 3_600_000;
    const d = new Date(localMs);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Converte um horário "HH:mm" de um dia civil específico para um timestamp UTC.
 * `dataLocal` é o meio-dia UTC do dia civil (conforme convenção de `dataLocal` nas janelas).
 * `fusoHorario` é o offset UTC em horas (ex.: -3 para BRT).
 */
export function localHHmmToUtc(dataLocal: Date, hhmm: string, fusoHorario: number): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const y = dataLocal.getUTCFullYear();
    const mo = dataLocal.getUTCMonth();
    const d = dataLocal.getUTCDate();
    const localMidnightUtcMs = Date.UTC(y, mo, d, 0, 0, 0) - fusoHorario * 3_600_000;
    return new Date(localMidnightUtcMs + (h * 60 + m) * 60_000);
}

/**
 * Encontra o período que contém o horário local em minutos.
 * Prioriza match pelo range nominal (sem tolerância); se não encontrar,
 * tenta match pelo range efetivo (com tolerâncias de entrada/saída).
 */
function findPeriodForMinutes(
    localMinutes: number,
    periodos: PeriodoConfig[],
): PeriodoConfig | null {
    for (const p of periodos) {
        const start = hhmmToMinutes(p.PERHorarioInicio);
        const end = hhmmToMinutes(p.PERHorarioFim);
        if (localMinutes >= start && localMinutes <= end) return p;
    }
    for (const p of periodos) {
        const { start, end } = periodEffectiveRange(p);
        if (localMinutes >= start && localMinutes <= end) return p;
    }
    return null;
}

/**
 * Divide uma window do state machine em sub-janelas por período com auto-complete.
 * Casos tratados:
 * - Entrada e saída no mesmo período → 1 janela.
 * - Entrada e saída em períodos diferentes → split nos limites de cada período.
 * - Janela aberta (sem saída) → auto-complete saída ao fim do período se já encerrou.
 * - Janela órfã (sem entrada) → auto-complete entrada ao início do período se já encerrou.
 * - Passagem fora de todos os períodos → PERCodigo=null (orphan).
 */
function splitWindowByPeriods(
    w: WindowState,
    periodos: PeriodoConfig[],
    dataLocal: Date,
    fusoHorario: number,
    pesCodigo: number,
    nowUtc: Date,
): Omit<JanelaAgregada, 'RPDJanelaIndice'>[] {
    const entryMins = w.entrada ? toLocalMinutes(w.entrada, fusoHorario) : null;
    const exitMins = w.saida ? toLocalMinutes(w.saida, fusoHorario) : null;

    const entryPeriod = entryMins !== null ? findPeriodForMinutes(entryMins, periodos) : null;
    const exitPeriod = exitMins !== null ? findPeriodForMinutes(exitMins, periodos) : null;

    const base = { PESCodigo: pesCodigo, dataLocal };

    if (!entryPeriod && !exitPeriod) {
        return [{ ...base, RPDDataEntrada: w.entrada, RPDDataSaida: w.saida, PERCodigo: null, codigosPassagem: w.codigos }];
    }

    if (entryPeriod && w.saida === null) {
        const periodEndUtc = localHHmmToUtc(dataLocal, entryPeriod.PERHorarioFim, fusoHorario);
        const autoSaida = periodEndUtc < nowUtc ? periodEndUtc : null;
        return [{ ...base, RPDDataEntrada: w.entrada, RPDDataSaida: autoSaida, PERCodigo: entryPeriod.PERCodigo, codigosPassagem: w.codigos }];
    }

    if (!entryPeriod && exitPeriod && w.entrada === null) {
        const periodEndUtc = localHHmmToUtc(dataLocal, exitPeriod.PERHorarioFim, fusoHorario);
        const periodStartUtc = localHHmmToUtc(dataLocal, exitPeriod.PERHorarioInicio, fusoHorario);
        const autoEntrada = periodEndUtc < nowUtc ? periodStartUtc : null;
        return [{ ...base, RPDDataEntrada: autoEntrada, RPDDataSaida: w.saida, PERCodigo: exitPeriod.PERCodigo, codigosPassagem: w.codigos }];
    }

    if (entryPeriod && !exitPeriod) {
        const periodEndUtc = localHHmmToUtc(dataLocal, entryPeriod.PERHorarioFim, fusoHorario);
        const autoSaida = periodEndUtc < nowUtc ? periodEndUtc : w.saida;
        return [{ ...base, RPDDataEntrada: w.entrada, RPDDataSaida: autoSaida, PERCodigo: entryPeriod.PERCodigo, codigosPassagem: w.codigos }];
    }

    if (!entryPeriod && exitPeriod) {
        const periodStartUtc = localHHmmToUtc(dataLocal, exitPeriod.PERHorarioInicio, fusoHorario);
        return [{ ...base, RPDDataEntrada: periodStartUtc, RPDDataSaida: w.saida, PERCodigo: exitPeriod.PERCodigo, codigosPassagem: w.codigos }];
    }

    if (entryPeriod!.PERCodigo === exitPeriod!.PERCodigo) {
        return [{ ...base, RPDDataEntrada: w.entrada, RPDDataSaida: w.saida, PERCodigo: entryPeriod!.PERCodigo, codigosPassagem: w.codigos }];
    }

    const ep = entryPeriod!;
    const xp = exitPeriod!;
    const entryPeriodStart = hhmmToMinutes(ep.PERHorarioInicio);
    const exitPeriodStart = hhmmToMinutes(xp.PERHorarioInicio);

    const spanned = periodos
        .filter((p) => {
            const ps = hhmmToMinutes(p.PERHorarioInicio);
            return ps >= entryPeriodStart && ps <= exitPeriodStart;
        })
        .sort((a, b) => hhmmToMinutes(a.PERHorarioInicio) - hhmmToMinutes(b.PERHorarioInicio));

    const result: Omit<JanelaAgregada, 'RPDJanelaIndice'>[] = [];
    for (let i = 0; i < spanned.length; i++) {
        const p = spanned[i];
        const isFirst = i === 0;
        const isLast = i === spanned.length - 1;
        const periodStartUtc = localHHmmToUtc(dataLocal, p.PERHorarioInicio, fusoHorario);
        const periodEndUtc = localHHmmToUtc(dataLocal, p.PERHorarioFim, fusoHorario);
        const periodEnded = periodEndUtc < nowUtc;

        let subEntrada: Date | null;
        let subSaida: Date | null;

        if (isFirst) {
            subEntrada = w.entrada;
            subSaida = periodEnded ? periodEndUtc : null;
        } else if (isLast) {
            subEntrada = periodEnded ? periodStartUtc : null;
            subSaida = w.saida;
        } else {
            subEntrada = periodEnded ? periodStartUtc : null;
            subSaida = periodEnded ? periodEndUtc : null;
        }

        result.push({
            ...base,
            RPDDataEntrada: subEntrada,
            RPDDataSaida: subSaida,
            PERCodigo: p.PERCodigo,
            codigosPassagem: isFirst ? w.codigos : [],
        });
    }

    return result;
}

/**
 * Agrega passagens no modo `tempo_permanencia_periodo`.
 *
 * Fase 1 — state machine: pareia ENTRADA/SAÍDA cronologicamente (idêntico a `tempo_permanencia`).
 * Fase 2:
 *   - autoComplete=false → atribui PERCodigo pela hora da entrada (ou saída se órfã).
 *   - autoComplete=true  → divide windows nos limites de período e auto-completa E/S ausentes.
 *
 * @param fusoHorario Offset UTC em horas de INSFusoHorario (ex.: -3).
 */
export function aggregateTempoPermanenciaPeriodo(
    passagens: PassagemParaAgregacao[],
    periodos: PeriodoConfig[],
    fusoHorario: number,
    options?: { autoComplete?: boolean; nowUtc?: Date },
): JanelaAgregada[] {
    const byPersonDay = groupPassagensByPersonDay(passagens);
    const result: JanelaAgregada[] = [];

    for (const [key, rows] of byPersonDay) {
        const { PESCodigo, dataLocal } = parsePersonDayKey(key);
        const sorted = [...rows].sort((a, b) => a.REGDataHora.getTime() - b.REGDataHora.getTime());

        const rawWindows = runStateMachine(sorted);

        if (options?.autoComplete && options.nowUtc) {
            let janelaIdx = 1;
            for (const w of rawWindows) {
                const subJanelas = splitWindowByPeriods(
                    w, periodos, dataLocal, fusoHorario, PESCodigo, options.nowUtc,
                );
                for (const j of subJanelas) {
                    result.push({ ...j, RPDJanelaIndice: janelaIdx++ });
                }
            }
        } else {
            rawWindows.forEach((w, idx) => {
                const refTime = w.entrada ?? w.saida;
                let perCodigo: number | null = null;
                if (refTime) {
                    const localMins = toLocalMinutes(refTime, fusoHorario);
                    const periodo = findPeriodForMinutes(localMins, periodos);
                    perCodigo = periodo?.PERCodigo ?? null;
                }
                result.push({
                    PESCodigo,
                    dataLocal,
                    RPDJanelaIndice: idx + 1,
                    RPDDataEntrada: w.entrada,
                    RPDDataSaida: w.saida,
                    PERCodigo: perCodigo,
                    codigosPassagem: w.codigos,
                });
            });
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// buildPassagemDayGroups — mantido para compatibilidade / selftests legados
// ---------------------------------------------------------------------------

/**
 * Agrupa passagens por (pessoa, dia civil UTC de REGDataHora).
 * Entrada/saída do dia: min(ENTRADA) e max(SAIDA) — comportamento `entrada_saida` legado.
 * @deprecated Prefira `aggregateEntradaSaida` para novos usos.
 */
export function buildPassagemDayGroups(
    passagens: PassagemParaAgregacao[],
): Map<string, GrupoAgregacaoDia> {
    const groups = new Map<string, GrupoAgregacaoDia>();
    for (const p of passagens) {
        const key = personDayKey(p.PESCodigo, p.REGDataHora);
        const y = p.REGDataHora.getUTCFullYear();
        const mo = p.REGDataHora.getUTCMonth();
        const day = p.REGDataHora.getUTCDate();
        const dayUtc = new Date(Date.UTC(y, mo, day, 12, 0, 0, 0));

        const existing = groups.get(key);
        if (existing) {
            existing.codigos.push(p.REGCodigo);
            if (p.REGAcao === AcaoPassagem.ENTRADA) {
                if (!existing.minEntrada || p.REGDataHora < existing.minEntrada) {
                    existing.minEntrada = p.REGDataHora;
                }
            } else if (p.REGAcao === AcaoPassagem.SAIDA) {
                if (!existing.maxSaida || p.REGDataHora > existing.maxSaida) {
                    existing.maxSaida = p.REGDataHora;
                }
            }
        } else {
            groups.set(key, {
                PESCodigo: p.PESCodigo,
                dataLocal: dayUtc,
                codigos: [p.REGCodigo],
                minEntrada: p.REGAcao === AcaoPassagem.ENTRADA ? p.REGDataHora : null,
                maxSaida: p.REGAcao === AcaoPassagem.SAIDA ? p.REGDataHora : null,
            });
        }
    }
    return groups;
}
