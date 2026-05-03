/**
 * Converte string `YYYY-MM-DD` (ex.: de `<input type="date">`) em `Date` ao meio-dia UTC.
 *
 * Meia-noite UTC no mesmo calendário vira o dia anterior em fusos como America/Sao_Paulo;
 * ao persistir em coluna `DATE` via driver a partir de timestamptz, o PostgreSQL pode gravar
 * o dia errado. Meio-dia UTC mantém o mesmo dia civil na grande maioria dos fusos usados
 * por instituições (incl. Brasil).
 */
export function parseIsoDateOnlyToUtcNoon(isoDate: string): Date {
  const datePart = isoDate.trim().split('T')[0].split(' ')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) {
    throw new Error(`Data deve estar no formato YYYY-MM-DD: ${datePart}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new Error(`Data inválida: ${datePart}`);
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}

/** Próximo dia civil (mantém 12:00 UTC). */
export function addUtcCalendarDays(dateAtUtcNoon: Date, days: number): Date {
  return new Date(
    Date.UTC(
      dateAtUtcNoon.getUTCFullYear(),
      dateAtUtcNoon.getUTCMonth(),
      dateAtUtcNoon.getUTCDate() + days,
      12,
      0,
      0,
      0,
    ),
  );
}
