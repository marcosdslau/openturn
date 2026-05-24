import { BadRequestException } from '@nestjs/common';

export interface PeriodoInterval {
  PERCodigo?: number;
  PERNome?: string;
  PERHorarioInicio: string;
  PERHorarioFim: string;
  PERToleranciaEntradaMinutos: number;
  PERToleranciaSaidaMinutos: number;
}

/** Converte "HH:mm" para minutos desde meia-noite [0, 1440). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Range nominal em minutos (PERHorarioInicio / PERHorarioFim), sem tolerâncias. Usado para validação de overlap. */
export function nominalRange(p: Pick<PeriodoInterval, 'PERHorarioInicio' | 'PERHorarioFim'>): { start: number; end: number } {
  return {
    start: hhmmToMinutes(p.PERHorarioInicio),
    end: hhmmToMinutes(p.PERHorarioFim),
  };
}

/** Range efetivo em minutos, expandido pelas tolerâncias (captura de passagens no worker). */
export function effectiveRange(p: PeriodoInterval): { start: number; end: number } {
  const start = hhmmToMinutes(p.PERHorarioInicio) - p.PERToleranciaEntradaMinutos;
  const end = hhmmToMinutes(p.PERHorarioFim) + p.PERToleranciaSaidaMinutos;
  return { start, end };
}

/**
 * Dois ranges se sobrepõem? Borda tocando também conta como overlap (PO §4.3).
 * Ex.: Manhã fim 12:00 + Tarde início 12:00 → inválido; use Tarde início 12:01.
 */
export function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Valida que `candidato` não sobrepõe nenhum dos períodos existentes.
 * Overlap usa apenas PERHorarioInicio/Fim (sem tolerâncias).
 * Passa `excludeId` ao atualizar para não conflitar consigo mesmo.
 * Lança BadRequestException com `code: 'PERIODO_OVERLAP'` se houver conflito.
 */
export function assertNoOverlap(
  candidato: PeriodoInterval,
  existentes: PeriodoInterval[],
  excludeId?: number,
): void {
  const candRange = nominalRange(candidato);

  for (const p of existentes) {
    if (excludeId !== undefined && p.PERCodigo === excludeId) continue;

    const existRange = nominalRange(p);
    if (rangesOverlap(candRange, existRange)) {
      const inicio = p.PERHorarioInicio;
      const fim = p.PERHorarioFim;
      throw new BadRequestException({
        message: `Há sobreposição de horário com o período "${p.PERNome ?? `${inicio}–${fim}`}" (${inicio}–${fim}).`,
        code: 'PERIODO_OVERLAP',
      });
    }
  }
}
