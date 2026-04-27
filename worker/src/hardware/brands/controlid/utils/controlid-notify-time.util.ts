/**
 * ControlID Monitor envia `body.time` em segundos (epoch). originTime = bruto;
 * regra de negócio: offset negativo soma horas, offset positivo subtrai horas.
 */
export function parseControlidBodyTimeToBigIntSeconds(
  raw: unknown,
): bigint | null {
  if (raw === undefined || raw === null) return null;
  try {
    const bi = BigInt(String(raw));
    return bi;
  } catch {
    return null;
  }
}

export function applyInstitutionFusoHorarioToNotifyTime(
  originTimeSeconds: bigint,
  offsetHoras: number,
): bigint {
  return originTimeSeconds - BigInt(offsetHoras) * 3600n;
}

export function formatControlidSecondsForBody(sec: bigint): number | string {
  return sec <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(sec) : sec.toString();
}
