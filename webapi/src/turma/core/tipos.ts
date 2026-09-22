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

/** O que a turma escolhe: se controla o acesso, por qual departamento e onde. */
export interface ValidacaoEntrada {
  ativa: boolean;
  /**
   * Departamento da instituição. Áreas, horários e regras vêm dele, configurados por equipamento —
   * a turma não define horário nenhum.
   */
  DEPCodigo?: number;
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
  /** O departamento da turma não foi adotado neste equipamento: a pessoa fica no grupo padrão. */
  | 'departamento_nao_adotado'
  /** Adotado, mas ninguém conferiu a configuração ainda. Não impede o acesso. */
  | 'departamento_nao_revisado'
  /** Adotado e sem nenhuma regra: ninguém do departamento passa neste equipamento. */
  | 'sem_regra'
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
