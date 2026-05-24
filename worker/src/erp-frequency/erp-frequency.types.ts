export interface ErpFrequencySendResult {
  enviados: number;
  erros: number;
  ignorados: number;
}

export interface ErpFrequencyProvider {
  readonly erpSistema: string;
  sendPendingFrequencies(instituicaoCodigo: number): Promise<ErpFrequencySendResult>;
}
