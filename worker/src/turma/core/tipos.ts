// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/tipos.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/** Faixa de horário como o usuário digita. `dias` tem 7 posições: dom..sab. */
export interface JanelaEntrada {
  inicio: string;
  fim: string;
  dias: boolean[];
}

export interface EscopoEntrada {
  /** true = todos os equipamentos ativos, inclusive os cadastrados depois. */
  todos: boolean;
  EQPCodigos?: number[];
}

/**
 * Sentido de giro, modelado como "entrada em uma área" (SpecControlId.md §4):
 * - interna = Entrada na Área Interna (entrar na escola)
 * - externa = Entrada na Área Externa (sair da escola)
 */
export type Sentido = 'interna' | 'externa';
export const SENTIDOS: readonly Sentido[] = ['interna', 'externa'];

/**
 * livre     = sempre liberado (horário 24h, todos os dias e feriados)
 * horario   = liberado só nas faixas informadas
 * bloqueado = nenhuma regra de permissão nesse sentido (modelo allow-only: ninguém da turma passa)
 */
export type ModoSentido = 'livre' | 'horario' | 'bloqueado';

export interface RegraSentidoEntrada {
  modo: ModoSentido;
  /** Obrigatório quando modo = 'horario'; ignorado nos demais. */
  horarios?: JanelaEntrada[];
}

export type RegrasEntrada = Record<Sentido, RegraSentidoEntrada>;

export interface ValidacaoEntrada {
  ativa: boolean;
  /** Regra independente para cada sentido. */
  regras?: RegrasEntrada;
  /**
   * @deprecated Formato anterior ao controle por sentido. Equivale a
   * `{ interna: { modo: 'horario', horarios }, externa: { modo: 'horario', horarios } }`.
   */
  horarios?: JanelaEntrada[];
  escopo: EscopoEntrada;
}

/** Quem originou a alteração — a configuração pode vir da tela ou de uma rotina. */
export type Origem =
  | { usuario: number }
  | { rotina: { ROTCodigo: number; exeId?: string } }
  | { sistema: true };

export type StatusEquipamento =
  | 'aplicado'
  | 'sem_mudanca'
  | 'removido'
  | 'aguardando_membros'
  | 'ocupado'
  | 'nao_suportado'
  /** Equipamento sem Área Interna/Externa preparadas — a regra por sentido não pode ser aplicada. */
  | 'sentido_nao_preparado'
  | 'inativo'
  | 'erro';

export interface ResultadoEquipamento {
  EQPCodigo: number;
  EQPDescricao: string | null;
  PHACodigo: number;
  PHANome: string;
  status: StatusEquipamento;
  mensagem?: string;
}

/** equipamento = falha de comunicação com o hardware (HTTP 502). */
export type CodigoErroTurma = 'validacao' | 'nao_encontrado' | 'conflito' | 'equipamento';

/** Erro de regra de negócio. A camada HTTP traduz `codigo` para 400/404/409. */
export class TurmaAcessoErro extends Error {
  constructor(
    message: string,
    readonly codigo: CodigoErroTurma,
    readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = 'TurmaAcessoErro';
  }
}

/** Turma lida do ERP, já no formato neutro que a rotina de catálogo entrega ao núcleo. */
export interface TurmaCatalogoEntrada {
  idExterno: string;
  idOferta?: string | null;
  nome: string;
  curso?: string | null;
  serie?: string | null;
  curriculo?: string | null;
  turno?: string | null;
  anoReferencia?: string | null;
  calendario?: string | null;
  dataInicio?: string | Date | null;
  dataFim?: string | Date | null;
}

export interface CatalogoEntrada {
  turmas: TurmaCatalogoEntrada[];
  /** idExterno da turma → idEnrollment (= MATMatricula.MATNumero) dos alunos. */
  matriculasPorTurma: Record<string, Array<string | number>>;
}
