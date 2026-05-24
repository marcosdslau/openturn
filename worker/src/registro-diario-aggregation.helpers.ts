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
 * Agrega passagens no modo `tempo_permanencia`.
 * Aplica state machine sobre passagens ordenadas cronologicamente por (pessoa, dia):
 * - ENTRADA sem janela aberta → abre nova janela.
 * - ENTRADA com janela aberta (sem SAIDA) → mantém início original, só acumula código (P1-A).
 * - ENTRADA após janela fechada (com SAIDA) → push janela anterior, abre nova.
 * - SAIDA com janela aberta → extende saída (max).
 * - SAIDA sem janela aberta → janela órfã { entrada: null, saida } (P3-B).
 */
export function aggregateTempoPermanencia(passagens: PassagemParaAgregacao[]): JanelaAgregada[] {
    const byPersonDay = groupPassagensByPersonDay(passagens);
    const result: JanelaAgregada[] = [];

    for (const [key, rows] of byPersonDay) {
        const sorted = [...rows].sort((a, b) => a.REGDataHora.getTime() - b.REGDataHora.getTime());
        let current: WindowState | null = null;
        const windows: WindowState[] = [];

        for (const p of sorted) {
            if (p.REGAcao === AcaoPassagem.ENTRADA) {
                if (current && current.saida !== null) {
                    // Janela anterior fechada — salva e abre nova
                    windows.push(current);
                    current = { entrada: p.REGDataHora, saida: null, codigos: [p.REGCodigo] };
                } else if (!current) {
                    current = { entrada: p.REGDataHora, saida: null, codigos: [p.REGCodigo] };
                } else {
                    // P1-A: janela aberta sem SAIDA — mantém início original
                    current.codigos.push(p.REGCodigo);
                }
            } else {
                // SAIDA
                if (current) {
                    current.codigos.push(p.REGCodigo);
                    if (!current.saida || p.REGDataHora > current.saida) {
                        current.saida = p.REGDataHora;
                    }
                } else {
                    // P3-B: SAIDA órfã — janela sem entrada
                    windows.push({ entrada: null, saida: p.REGDataHora, codigos: [p.REGCodigo] });
                }
            }
        }
        if (current) windows.push(current);

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

/** Constrói uma janela min(ENTRADA)/max(SAIDA) a partir de um conjunto de passagens. */
function buildMinMaxJanela(
    passagens: PassagemParaAgregacao[],
    meta: Pick<JanelaAgregada, 'PESCodigo' | 'dataLocal' | 'RPDJanelaIndice' | 'PERCodigo'>,
): JanelaAgregada {
    let minEntrada: Date | null = null;
    let maxSaida: Date | null = null;
    const codigos: number[] = [];
    for (const p of passagens) {
        codigos.push(p.REGCodigo);
        if (p.REGAcao === AcaoPassagem.ENTRADA) {
            if (!minEntrada || p.REGDataHora < minEntrada) minEntrada = p.REGDataHora;
        } else {
            if (!maxSaida || p.REGDataHora > maxSaida) maxSaida = p.REGDataHora;
        }
    }
    return { ...meta, RPDDataEntrada: minEntrada, RPDDataSaida: maxSaida, codigosPassagem: codigos };
}

/**
 * Agrega passagens no modo `tempo_permanencia_periodo`.
 * Para cada (pessoa, dia) e cada período configurado:
 * - Filtra passagens cujo horário local ∈ [capturaInicio, capturaFim] do período.
 * - Se houver → janela min(ENTRADA)/max(SAIDA) com PERCodigo.
 * - Passagens não capturadas por nenhum período → uma janela extra (P4-A) com PERCodigo = null.
 *
 * @param fusoHorario Offset UTC em horas de INSFusoHorario (ex.: -3).
 */
export function aggregateTempoPermanenciaPeriodo(
    passagens: PassagemParaAgregacao[],
    periodos: PeriodoConfig[],
    fusoHorario: number,
): JanelaAgregada[] {
    const byPersonDay = groupPassagensByPersonDay(passagens);
    const result: JanelaAgregada[] = [];

    for (const [key, rows] of byPersonDay) {
        const { PESCodigo, dataLocal } = parsePersonDayKey(key);
        const capturedCodigos = new Set<number>();
        let janelaIdx = 1;

        for (const periodo of periodos) {
            const { start, end } = periodEffectiveRange(periodo);
            const inPeriod = rows.filter((p) => {
                const mins = toLocalMinutes(p.REGDataHora, fusoHorario);
                return mins >= start && mins <= end;
            });
            if (inPeriod.length === 0) continue;

            inPeriod.forEach((p) => capturedCodigos.add(p.REGCodigo));
            result.push(
                buildMinMaxJanela(inPeriod, {
                    PESCodigo,
                    dataLocal,
                    RPDJanelaIndice: janelaIdx++,
                    PERCodigo: periodo.PERCodigo,
                }),
            );
        }

        // P4-A: janela extra com passagens fora de todos os períodos
        const orphan = rows.filter((p) => !capturedCodigos.has(p.REGCodigo));
        if (orphan.length > 0) {
            result.push(
                buildMinMaxJanela(orphan, {
                    PESCodigo,
                    dataLocal,
                    RPDJanelaIndice: janelaIdx,
                    PERCodigo: null,
                }),
            );
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
