export type InternalJobKind =
  | 'RPD_AGGREGATION'
  | 'FREQ_ERP_SYNC';

export interface RotinaJobData {
  exeId: string;
  rotinaCodigo: number;
  instituicaoCodigo: number;
  trigger: 'SCHEDULE' | 'WEBHOOK' | 'INTERNAL';
  internalKind?: InternalJobKind;
  requestEnvelope?: any;
  enqueuedAt: string;
}
