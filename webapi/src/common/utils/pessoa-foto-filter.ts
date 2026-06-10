import { Prisma } from '@prisma/client';

export type PessoaFotoFiltro = 'com' | 'sem';

export function buildPessoaFotoWhere(
  foto?: PessoaFotoFiltro,
): Prisma.PESPessoaWhereInput | undefined {
  if (foto === 'com') {
    return {
      AND: [{ PESFotoBase64: { not: null } }, { NOT: { PESFotoBase64: '' } }],
    };
  }
  if (foto === 'sem') {
    return { OR: [{ PESFotoBase64: null }, { PESFotoBase64: '' }] };
  }
  return undefined;
}
