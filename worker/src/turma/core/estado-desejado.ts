// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/estado-desejado.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/** Recorte da turma necessário para decidir escopo e estado desejado (§7 da spec). */
export interface TurmaEstado {
  TRMCodigo: number;
  /** Departamento da instituição. É o único vínculo de configuração da turma no modelo novo. */
  DEPCodigo: number | null;
  TRMValidacaoAtiva: boolean;
  TRMAtiva: boolean;
  TRMTodosEquipamentos: boolean;
  /** EQPCodigos selecionados (TEQTurmaEquipamento). Ignorado quando TRMTodosEquipamentos. */
  escopo: number[];
}

/** Linha de TRMTurma (com `escopo` incluído) → TurmaEstado. */
export function paraTurmaEstado(t: {
  TRMCodigo: number;
  DEPCodigo?: number | null;
  TRMValidacaoAtiva: boolean;
  TRMAtiva: boolean;
  TRMTodosEquipamentos: boolean;
  escopo?: Array<{ EQPCodigo: number }>;
}): TurmaEstado {
  return {
    TRMCodigo: t.TRMCodigo,
    DEPCodigo: t.DEPCodigo ?? null,
    TRMValidacaoAtiva: t.TRMValidacaoAtiva,
    TRMAtiva: t.TRMAtiva,
    TRMTodosEquipamentos: t.TRMTodosEquipamentos,
    escopo: (t.escopo ?? []).map((e) => e.EQPCodigo),
  };
}

export function noEscopo(turma: Pick<TurmaEstado, 'TRMTodosEquipamentos' | 'escopo'>, eqpCodigo: number): boolean {
  return turma.TRMTodosEquipamentos || turma.escopo.includes(eqpCodigo);
}

/** Turma cuja regra deve valer nos equipamentos do seu escopo. */
export function turmaVigente(
  turma: Pick<TurmaEstado, 'TRMValidacaoAtiva' | 'TRMAtiva' | 'DEPCodigo'>,
): boolean {
  return turma.TRMValidacaoAtiva && turma.TRMAtiva && turma.DEPCodigo != null;
}

/** EQPCodigos efetivos do escopo, restritos aos equipamentos ativos informados. */
export function resolverEscopo(
  turma: Pick<TurmaEstado, 'TRMTodosEquipamentos' | 'escopo'>,
  equipamentosAtivos: number[],
): number[] {
  return turma.TRMTodosEquipamentos
    ? [...equipamentosAtivos]
    : equipamentosAtivos.filter((codigo) => turma.escopo.includes(codigo));
}

/** Equipamentos que entraram ou saíram do escopo. */
export function diferencaSimetrica(antes: number[], depois: number[]): number[] {
  const a = new Set(antes);
  const b = new Set(depois);
  return [...new Set([...antes, ...depois])].filter((x) => a.has(x) !== b.has(x)).sort((x, y) => x - y);
}

/** Turma efetiva da pessoa, com o que ela precisa para resolver o departamento por equipamento. */
export interface TurmaEfetiva extends TurmaEstado {
  /** EQPCodigo → nome do departamento adotado naquele equipamento (`DEQNome`). */
  departamentoPorEquipamento: Map<number, string>;
}

/**
 * Departamento da pessoa num equipamento; `null`/`PESGrupo` = grupo padrão.
 *
 * O nome vem do departamento adotado naquele equipamento. Note que **não** depende de
 * `DEQRevisadoEm`: revisão é sobre a configuração ter sido conferida por alguém, não sobre quem
 * entra no grupo. Tirar as pessoas de um departamento não revisado mudaria o acesso delas
 * justamente no momento em que ninguém ainda olhou.
 */
export function grupoNoEquipamento(
  pessoa: { PESGrupo: string | null },
  turmaEfetiva: TurmaEfetiva | null,
  eqpCodigo: number,
): string | null {
  const padrao = pessoa.PESGrupo ?? null;
  if (!turmaEfetiva || !turmaVigente(turmaEfetiva) || !noEscopo(turmaEfetiva, eqpCodigo)) return padrao;
  return turmaEfetiva.departamentoPorEquipamento.get(eqpCodigo) ?? padrao;
}

export interface CandidataEleicao {
  TRMCodigo: number;
  TRMPrioridade: number;
  /** createdAt da matrícula que liga a pessoa à turma. */
  matriculaCriadaEm: Date;
}

/** Desempate: maior prioridade, depois matrícula mais recente, depois menor código (estável). */
export function elegerTurma<T extends CandidataEleicao>(candidatas: T[]): T | null {
  if (!candidatas.length) return null;
  return [...candidatas].sort(
    (a, b) =>
      b.TRMPrioridade - a.TRMPrioridade ||
      new Date(b.matriculaCriadaEm).getTime() - new Date(a.matriculaCriadaEm).getTime() ||
      a.TRMCodigo - b.TRMCodigo,
  )[0];
}

function normalizarTexto(v: string | null | undefined): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Vínculo matrícula → turma (§12.2):
 * uma candidata → ela; nenhuma → null; várias → desempata pelo nome da turma
 * gravado na matrícula; persistindo, mantém o vínculo atual se ele for candidato.
 */
export function resolverTurmaDaMatricula(
  matricula: { MATTurma: string | null; TRMCodigo: number | null },
  candidatas: Array<{ TRMCodigo: number; TRMTurma: string }>,
): { TRMCodigo: number | null; ambiguo: boolean } {
  if (candidatas.length === 0) return { TRMCodigo: null, ambiguo: false };
  if (candidatas.length === 1) return { TRMCodigo: candidatas[0].TRMCodigo, ambiguo: false };

  const porNome = candidatas.filter((c) => normalizarTexto(c.TRMTurma) === normalizarTexto(matricula.MATTurma));
  if (porNome.length === 1) return { TRMCodigo: porNome[0].TRMCodigo, ambiguo: false };

  if (matricula.TRMCodigo != null && candidatas.some((c) => c.TRMCodigo === matricula.TRMCodigo)) {
    return { TRMCodigo: matricula.TRMCodigo, ambiguo: true };
  }
  return { TRMCodigo: null, ambiguo: true };
}

/** Chave para sugerir correspondência entre anos letivos (§13.5). */
export function chaveCorrespondenciaAnual(t: {
  TRMCurso: string | null;
  TRMSerie: string | null;
  TRMTurma: string;
  TRMTurno: string | null;
}): string {
  return [t.TRMCurso, t.TRMSerie, t.TRMTurma, t.TRMTurno].map(normalizarTexto).join('|');
}
