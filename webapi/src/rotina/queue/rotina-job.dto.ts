export type InternalJobKind = 'RPD_AGGREGATION' | 'FREQ_ERP_SYNC';

export interface RotinaJobData {
  exeId: string;
  rotinaCodigo: number;
  instituicaoCodigo: number;
  trigger: 'SCHEDULE' | 'WEBHOOK' | 'INTERNAL';
  /** Discriminador de tipo para jobs INTERNAL. Jobs legados sem campo → RPD_AGGREGATION. */
  internalKind?: InternalJobKind;
  /** Última execução agendada do dia (calculada na publicação do job). */
  isLastRunOfDay?: boolean;
  /**
   * FREQ_ERP_SYNC: dia civil local da instituição a reprocessar antes do envio
   * ao ERP, formato `YYYY-MM-DD`. Fixado na publicação para não escorregar de dia
   * quando o consumo atrasa.
   */
  diaAlvoLocal?: string;
  /**
   * RPD_AGGREGATION: janela civil (`YYYY-MM-DD`) à qual a agregação fica restrita.
   * Presente apenas no reprocessamento retroativo — jobs agendados não a enviam e
   * mantêm o comportamento padrão (backlog pendente + reconciliação do dia corrente).
   * Comparada contra RPDData, o mesmo critério usado para apagar os registros.
   */
  janelaInicio?: string;
  janelaFim?: string;
  requestEnvelope?: any;
  enqueuedAt: string;
}
