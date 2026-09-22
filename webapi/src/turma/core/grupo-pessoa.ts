import type { PrismaClient } from '@prisma/client';
import { grupoNoEquipamento, paraTurmaEstado, type TurmaEfetiva } from './estado-desejado';

/**
 * Departamento que a pessoa deve ter em cada equipamento (§7.2 da spec).
 *
 * Função isolada (sem hardware nem lock) porque é usada por todos os caminhos que
 * enviam pessoa ao equipamento: a rotina de gravação e os envios físicos diretos
 * (`buildHardwareUser` na webapi e no worker). Usa o nome ATUAL do perfil da turma,
 * não o denormalizado em PESGrupoHorario — assim um envio que acontece entre a troca
 * de perfil e a rotina de vínculo já leva o perfil novo.
 *
 * O nome vem do departamento ADOTADO naquele equipamento (`DEQNome`). Equipamento sem adoção →
 * grupo padrão, porque não existe grupo nenhum para a pessoa lá.
 */
export async function resolverGruposDaPessoa(
  prisma: PrismaClient,
  pessoa: {
    PESCodigo: number;
    INSInstituicaoCodigo: number;
    PESGrupo: string | null;
    PESTRMCodigo?: number | null;
  },
  eqpCodigos: number[],
): Promise<Map<number, string | null>> {
  let trmCodigo = pessoa.PESTRMCodigo;
  if (trmCodigo === undefined) {
    const linha = await prisma.pESPessoa.findFirst({
      where: { PESCodigo: pessoa.PESCodigo, INSInstituicaoCodigo: pessoa.INSInstituicaoCodigo },
      select: { PESTRMCodigo: true },
    });
    trmCodigo = linha?.PESTRMCodigo ?? null;
  }

  let turma: TurmaEfetiva | null = null;
  if (trmCodigo != null) {
    const t = await prisma.tRMTurma.findFirst({
      where: { TRMCodigo: trmCodigo, INSInstituicaoCodigo: pessoa.INSInstituicaoCodigo },
      include: {
        escopo: { select: { EQPCodigo: true } },
        departamento: {
          select: {
            equipamentos: {
              where: { EQPCodigo: { in: eqpCodigos } },
              select: { EQPCodigo: true, DEQNome: true },
            },
          },
        },
      },
    });
    if (t) {
      turma = {
        ...paraTurmaEstado(t),
        departamentoPorEquipamento: new Map(
          (t.departamento?.equipamentos ?? []).map((d) => [d.EQPCodigo, d.DEQNome]),
        ),
      };
    }
  }

  const mapa = new Map<number, string | null>();
  for (const eqp of eqpCodigos) {
    mapa.set(eqp, grupoNoEquipamento(pessoa, turma, eqp));
  }
  return mapa;
}
