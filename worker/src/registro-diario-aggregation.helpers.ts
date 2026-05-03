import { AcaoPassagem } from '@prisma/client';

/** Linhas mínimas de REGRegistroPassagem para agregação em RPD (worker). */
export type PassagemParaAgregacao = {
    REGCodigo: number;
    PESCodigo: number;
    REGDataHora: Date;
    REGAcao: AcaoPassagem;
};

export type GrupoAgregacaoDia = {
    PESCodigo: number;
    /**
     * Meio-dia UTC do dia civil **no** calendário em que `REGDataHora` está gravado (componentes UTC).
     * Não aplicar fuso da instituição: `REGDataHora` já está em UTC no banco.
     * Meio-dia evita coluna DATE no PG virar o dia anterior com sessão em America/Sao_Paulo.
     */
    dataLocal: Date;
    codigos: number[];
    /** Menor horário entre passagens do tipo ENTRADA (apenas ENTRADA). */
    minEntrada: Date | null;
    /** Maior horário entre passagens do tipo SAIDA (apenas SAIDA). */
    maxSaida: Date | null;
};

/**
 * Agrupa passagens por (pessoa, dia civil UTC de REGDataHora).
 * Entrada/saída do dia seguem o tipo da passagem: primeira ENTRADA e última SAIDA.
 */
export function buildPassagemDayGroups(
    passagens: PassagemParaAgregacao[],
): Map<string, GrupoAgregacaoDia> {
    const groups = new Map<string, GrupoAgregacaoDia>();
    for (const p of passagens) {
        const d = p.REGDataHora;
        const y = d.getUTCFullYear();
        const mo = d.getUTCMonth();
        const day = d.getUTCDate();
        const dayKey = `${p.PESCodigo}|${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const dayUtc = new Date(Date.UTC(y, mo, day, 12, 0, 0, 0));

        const existing = groups.get(dayKey);
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
            groups.set(dayKey, {
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
