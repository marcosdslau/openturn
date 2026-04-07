/** Teto seguro para `setTimeout` (ms) em ambientes que usam inteiro 32-bit assinado. */
export const ROUTINE_TIMEOUT_MS_CAP = 2_147_483_647;

/**
 * `ROTTimeoutSeconds` do cadastro da rotina. Inválido/ausente → 30 (alinhado ao default do Prisma).
 * Limitado para que `sec * 1000` caiba em timers estáveis.
 */
export function routineTimeoutSecondsFromCadastro(value: unknown): number {
    const n = typeof value === 'number' && !Number.isNaN(value) ? value : Number(value);
    if (!Number.isFinite(n)) return 30;
    const sec = Math.floor(Math.max(1, n));
    const maxSec = Math.floor(ROUTINE_TIMEOUT_MS_CAP / 1000);
    return Math.min(sec, maxSec);
}
