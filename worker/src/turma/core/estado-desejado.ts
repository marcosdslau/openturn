// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/estado-desejado.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/** Recorte da turma necessário para decidir escopo e estado desejado (§7 da spec). */
export interface TurmaEstado {
  TRMCodigo: number;
  PHACodigo: number | null;
  TRMValidacaoAtiva: boolean;
  TRMAtiva: boolean;
  TRMTodosEquipamentos: boolean;
  /** EQPCodigos selecionados (TEQTurmaEquipamento). Ignorado quando TRMTodosEquipamentos. */
  escopo: number[];
}

export interface EquipamentoEstado {
  EQPCodigo: number;
  EQPAtivo: boolean;
  /**
   * Área Interna/Externa e portais preparados no equipamento (EQSEquipamentoSentido).
   * Sem isso a regra por sentido não pode ser aplicada: o equipamento fica fora do escopo efetivo.
   */
  sentidoPreparado: boolean;
}

/** Linha de TRMTurma (com `escopo` incluído) → TurmaEstado. */
export function paraTurmaEstado(t: {
  TRMCodigo: number;
  PHACodigo: number | null;
  TRMValidacaoAtiva: boolean;
  TRMAtiva: boolean;
  TRMTodosEquipamentos: boolean;
  escopo?: Array<{ EQPCodigo: number }>;
}): TurmaEstado {
  return {
    TRMCodigo: t.TRMCodigo,
    PHACodigo: t.PHACodigo,
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
export function turmaVigente(turma: Pick<TurmaEstado, 'TRMValidacaoAtiva' | 'TRMAtiva' | 'PHACodigo'>): boolean {
  return turma.TRMValidacaoAtiva && turma.TRMAtiva && turma.PHACodigo != null;
}

export function perfilDeveExistir(phaCodigo: number, eqp: EquipamentoEstado, turmas: TurmaEstado[]): boolean {
  if (!eqp.EQPAtivo || !eqp.sentidoPreparado) return false;
  return turmas.some((t) => t.PHACodigo === phaCodigo && turmaVigente(t) && noEscopo(t, eqp.EQPCodigo));
}

/** null = "não deve haver nada deste perfil neste equipamento". */
export function hashDesejado(
  perfil: { PHACodigo: number; PHAHashConfig: string },
  eqp: EquipamentoEstado,
  turmas: TurmaEstado[],
): string | null {
  return perfilDeveExistir(perfil.PHACodigo, eqp, turmas) ? perfil.PHAHashConfig : null;
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

/**
 * Departamento da pessoa num equipamento (§7.2): perfil da turma efetiva quando o
 * equipamento está no escopo, tem as áreas preparadas e a turma está vigente;
 * senão o grupo padrão (PESGrupo).
 */
export function grupoNoEquipamento(
  pessoa: { PESGrupo: string | null },
  turmaEfetiva: (TurmaEstado & { perfilNome: string | null }) | null,
  eqpCodigo: number,
  sentidoPreparado: boolean,
): string | null {
  if (
    sentidoPreparado &&
    turmaEfetiva &&
    turmaVigente(turmaEfetiva) &&
    turmaEfetiva.perfilNome &&
    noEscopo(turmaEfetiva, eqpCodigo)
  ) {
    return turmaEfetiva.perfilNome;
  }
  return pessoa.PESGrupo ?? null;
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
