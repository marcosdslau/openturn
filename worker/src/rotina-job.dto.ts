export type InternalJobKind =
  | 'RPD_AGGREGATION'
  | 'FREQ_ERP_SYNC';

export interface RotinaJobData {
  exeId: string;
  rotinaCodigo: number;
  instituicaoCodigo: number;
  trigger: 'SCHEDULE' | 'WEBHOOK' | 'INTERNAL';
  internalKind?: InternalJobKind;
  /** Última execução agendada do dia (calculada na publicação do job). */
  isLastRunOfDay?: boolean;
  /**
   * FREQ_ERP_SYNC: dia civil local da instituição a reprocessar antes do envio
   * ao ERP, formato `YYYY-MM-DD`. Fixado na publicação para não escorregar de dia
   * quando o consumo atrasa.
   */
  diaAlvoLocal?: string;
  requestEnvelope?: any;
  enqueuedAt: string;
}
