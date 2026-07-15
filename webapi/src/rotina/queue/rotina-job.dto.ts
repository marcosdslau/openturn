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
  requestEnvelope?: any;
  enqueuedAt: string;
}
