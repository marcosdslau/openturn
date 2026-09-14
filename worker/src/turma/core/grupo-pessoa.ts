// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/grupo-pessoa.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { PrismaClient } from '@prisma/client';
import { grupoNoEquipamento, paraTurmaEstado } from './estado-desejado';

/**
 * Departamento que a pessoa deve ter em cada equipamento (§7.2 da spec).
 *
 * Função isolada (sem hardware nem lock) porque é usada por todos os caminhos que
 * enviam pessoa ao equipamento: a rotina de gravação e os envios físicos diretos
 * (`buildHardwareUser` na webapi e no worker). Usa o nome ATUAL do perfil da turma,
 * não o denormalizado em PESGrupoHorario — assim um envio que acontece entre a troca
 * de perfil e a rotina de vínculo já leva o perfil novo.
 *
 * Equipamento sem Área Interna/Externa preparadas não aplica regra de turma: a pessoa
 * fica no grupo padrão lá (senão ficaria pendente para sempre esperando um grupo que
 * nunca será criado).
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

  let turma: (ReturnType<typeof paraTurmaEstado> & { perfilNome: string | null }) | null = null;
  const preparados = new Set<number>();
  if (trmCodigo != null) {
    const [t, sentidos] = await Promise.all([
      prisma.tRMTurma.findFirst({
        where: { TRMCodigo: trmCodigo, INSInstituicaoCodigo: pessoa.INSInstituicaoCodigo },
        include: { escopo: { select: { EQPCodigo: true } }, perfil: { select: { PHANome: true } } },
      }),
      prisma.eQSEquipamentoSentido.findMany({
        where: {
          INSInstituicaoCodigo: pessoa.INSInstituicaoCodigo,
          EQPCodigo: { in: eqpCodigos },
          EQSPortalInternaId: { not: null },
          EQSPortalExternaId: { not: null },
        },
        select: { EQPCodigo: true },
      }),
    ]);
    if (t) turma = { ...paraTurmaEstado(t), perfilNome: t.perfil?.PHANome ?? null };
    for (const s of sentidos) preparados.add(s.EQPCodigo);
  }

  const mapa = new Map<number, string | null>();
  for (const eqp of eqpCodigos) {
    mapa.set(eqp, grupoNoEquipamento(pessoa, turma, eqp, preparados.has(eqp)));
  }
  return mapa;
}
