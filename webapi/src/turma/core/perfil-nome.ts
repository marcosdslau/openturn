/** Limite de nome no equipamento (decisão do PO). Medido em bytes UTF-8, que satisfaz bytes e caracteres. */
export const PERFIL_NOME_MAX_BYTES = 15;

export function normalizarNomePerfil(nome: string): string {
  return String(nome ?? '').trim().replace(/\s+/g, ' ');
}

export function bytesUtf8(texto: string): number {
  return Buffer.byteLength(texto, 'utf8');
}

/** Retorna a mensagem de erro, ou null quando o nome é válido. */
export function validarNomePerfil(nome: string, reservados: string[]): string | null {
  const n = normalizarNomePerfil(nome);
  if (!n) return 'Informe o nome do perfil';
  if (bytesUtf8(n) > PERFIL_NOME_MAX_BYTES) {
    return `Máximo de ${PERFIL_NOME_MAX_BYTES} caracteres (letras acentuadas contam como 2)`;
  }
  if (reservados.some((r) => r.trim().toLowerCase() === n.toLowerCase())) {
    return `O nome "${n}" já está em uso`;
  }
  return null;
}

/** "vespertino" → "VESPERTINO"; "Semi-integral" → "SEMIINTEGRAL"; vazio → "HORARIO". */
export function prefixoDoTurno(turno: string | null | undefined): string {
  const ascii = String(turno ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return ascii.slice(0, 12) || 'HORARIO'; // 12 + "-NN" = 15 bytes no máximo
}

export function sugerirNomePerfil(turno: string | null | undefined, existentes: string[]): string {
  const prefixo = prefixoDoTurno(turno);
  const usados = new Set(existentes.map((e) => e.trim().toLowerCase()));
  for (let i = 1; i <= 99; i++) {
    const nome = `${prefixo}-${String(i).padStart(2, '0')}`;
    if (!usados.has(nome.toLowerCase())) return nome;
  }
  throw new Error(`Limite de perfis com prefixo ${prefixo} atingido`);
}
