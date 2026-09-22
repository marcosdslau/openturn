// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/perfil-nome.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/** Limite de nome no equipamento (decisão do PO). Medido em bytes UTF-8: o firmware trunca por bytes. */
export const PERFIL_NOME_MAX_BYTES = 15;

export function normalizarNomePerfil(nome: string): string {
  return String(nome ?? '').trim().replace(/\s+/g, ' ');
}

export function bytesUtf8(texto: string): number {
  return Buffer.byteLength(texto, 'utf8');
}
