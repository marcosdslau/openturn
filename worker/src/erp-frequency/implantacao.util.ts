import { PrismaClient } from '@prisma/client';
import { ImplantacaoFiltro } from './erp-frequency.types';

/**
 * Resolve quais PESCodigo estão liberados para envio ao ERP com base no
 * filtro de implantação (turmas pioneiras).
 *
 * Retorna null quando não há restrição de turma a aplicar (implantação
 * desativada — o piso de data, se houver, é aplicado separadamente pelo
 * provider). Retorna um array (possivelmente vazio) de PESCodigo quando a
 * implantação está ativa — array vazio = nenhum aluno liberado.
 */
export async function resolveAllowedPessoaCodigos(
  prisma: PrismaClient,
  instituicaoCodigo: number,
  filtro: ImplantacaoFiltro | undefined,
): Promise<number[] | null> {
  if (!filtro?.ativo) return null;
  if (filtro.combinacoes.length === 0) return [];

  const matriculas = await prisma.mATMatricula.findMany({
    where: {
      INSInstituicaoCodigo: instituicaoCodigo,
      MATAtivo: true,
      OR: filtro.combinacoes.map((c) => ({
        MATCurso: c.curso,
        MATSerie: c.serie,
        MATTurma: c.turma,
      })),
    },
    select: { PESCodigo: true },
    distinct: ['PESCodigo'],
  });

  return matriculas.map((m) => m.PESCodigo);
}
