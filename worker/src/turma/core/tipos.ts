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

export interface ValidacaoEntrada {
  ativa: boolean;
  horarios: JanelaEntrada[];
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

export type CodigoErroTurma = 'validacao' | 'nao_encontrado' | 'conflito';

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
