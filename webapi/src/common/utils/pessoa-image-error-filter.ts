import { Prisma } from '@prisma/client';

export type PessoaImageErrorFiltro = 'com' | 'sem';

export function buildPessoaImageErrorWhere(
  erro?: PessoaImageErrorFiltro,
): Prisma.PESPessoaWhereInput | undefined {
  if (erro === 'com') {
    return { PESImageError: { not: Prisma.DbNull } };
  }
  if (erro === 'sem') {
    return { PESImageError: { equals: Prisma.DbNull } };
  }
  return undefined;
}
