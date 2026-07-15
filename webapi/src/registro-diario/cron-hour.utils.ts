/**
 * Utilitários para extrair horas de expressões cron e determinar
 * se a execução atual é a última agendada do dia (fuso local da instituição).
 */

/** Converte timestamp UTC para hora local [0, 23] usando offset em horas. */
export function toLocalHour(nowUtc: Date, fusoHorario: number): number {
  const localMs = nowUtc.getTime() + fusoHorario * 3_600_000;
  return new Date(localMs).getUTCHours();
}

/** Expande um segmento de campo de hora (ex.: "9", "9-12", "*") em lista de horas. */
function expandHourSegment(segment: string): number[] {
  const trimmed = segment.trim();
  if (!trimmed) return [];

  if (trimmed === '*') {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  if (trimmed.includes('/')) {
    const [rangePart, stepStr] = trimmed.split('/');
    const step = Number(stepStr);
    if (!Number.isFinite(step) || step <= 0) return [];
    const base = rangePart === '*' ? expandHourSegment('*') : expandHourSegment(rangePart);
    const result: number[] = [];
    for (let i = 0; i < base.length; i += step) {
      result.push(base[i]);
    }
    return result;
  }

  if (trimmed.includes('-')) {
    const [startStr, endStr] = trimmed.split('-');
    const start = Number(startStr);
    const end = Number(endStr);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const result: number[] = [];
    for (let h = start; h <= end; h++) result.push(h);
    return result;
  }

  const hour = Number(trimmed);
  return Number.isFinite(hour) ? [hour] : [];
}

/**
 * Extrai as horas agendadas de uma expressão cron.
 * Suporta 5 campos (`m h dom mon dow`) e 6 campos (`s m h dom mon dow`).
 */
export function extractHoursFromCron(cronExpr: string): number[] {
  const fields = cronExpr.trim().split(/\s+/).filter(Boolean);
  if (fields.length < 5) return [];

  const hourField = fields.length >= 6 ? fields[2] : fields[1];
  const hours = new Set<number>();

  for (const part of hourField.split(',')) {
    for (const h of expandHourSegment(part)) {
      if (h >= 0 && h <= 23) hours.add(h);
    }
  }

  return [...hours].sort((a, b) => a - b);
}

/**
 * Retorna true se a hora local atual coincide com a maior hora configurada no cron.
 * Calculado no momento da publicação do job (não no consumo pelo worker).
 */
export function isLastScheduledHour(
  cronExpr: string,
  nowUtc: Date,
  fusoHorario: number,
): boolean {
  const horas = extractHoursFromCron(cronExpr);
  if (horas.length === 0) return false;
  const horaLocal = toLocalHour(nowUtc, fusoHorario);
  return horaLocal === Math.max(...horas);
}
