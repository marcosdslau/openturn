// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/hardware/brands/controlid/access-group/controlid-objects.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/**
 * Acesso cru às tabelas do Control iD (`.fcgi`), sem opinião de domínio.
 *
 * FONTE DA VERDADE em webapi/src/hardware/brands/controlid/access-group. O worker recebe uma cópia
 * gerada no build (`npm run shared:sync`) — não edite a cópia. Não importa nada de fora desta
 * pasta: recebe apenas a função de POST do provider (com sessão e retry já tratados).
 */

export type ControlIdPost = (fcgiPath: string, body: unknown) => Promise<{ data: unknown }>;

export type Linha = Record<string, unknown> & { id?: number | string; name?: string };

/** Comparação de nome tolerante a acento, caixa e espaço nas pontas. */
export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

export const mesmoId = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b);

/** O firmware trunca por bytes, não por caracteres: "Á" ocupa 2. */
export function truncarBytes(texto: string, max: number): string {
  let saida = '';
  for (const ch of texto) {
    if (Buffer.byteLength(saida + ch, 'utf8') > max) break;
    saida += ch;
  }
  return saida;
}

/**
 * As quatro operações que o equipamento expõe. `criar` devolve o id da LINHA criada — em tabelas
 * de vínculo (`access_rule_time_zones`, `portal_access_rules`, `group_access_rules`) esse id NÃO é
 * id de regra, e encadeá-lo como `access_rule_id` liga a regra errada sem o device reclamar
 * (docs/controle-por-turma/README.md §6.1).
 */
export function criarObjetos(post: ControlIdPost) {
  const carregar = async (object: string, where?: Record<string, unknown>): Promise<Linha[]> => {
    const res = await post('/load_objects.fcgi', where ? { object, where: { [object]: where } } : { object });
    return (((res.data as Record<string, unknown>)?.[object] as Linha[]) ?? []).filter(Boolean);
  };

  const criar = async (object: string, values: Record<string, unknown>[]): Promise<number[]> => {
    const res = await post('/create_objects.fcgi', { object, values });
    return (((res.data as Record<string, unknown>)?.ids as number[]) ?? []).map(Number);
  };

  const apagar = (object: string, where: Record<string, unknown>) =>
    post('/destroy_objects.fcgi', { object, where: { [object]: where } });

  const renomear = (object: string, id: number, name: string) =>
    post('/modify_objects.fcgi', { object, values: { name }, where: { [object]: { id } } });

  return { carregar, criar, apagar, renomear };
}
