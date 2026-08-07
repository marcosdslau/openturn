export interface ErpFrequencySendResult {
  enviados: number;
  erros: number;
  ignorados: number;
}

export interface ImplantacaoCombinacao {
  curso: string;
  serie: string;
  turma: string;
}

export interface ImplantacaoFiltro {
  /** true = instituição em implantação, envio restrito às turmas em `combinacoes`. */
  ativo: boolean;
  combinacoes: ImplantacaoCombinacao[];
  /**
   * Piso de RPDData (INSDataGoLive). Só é aplicado pelo provider quando
   * `ativo === false` — enquanto a implantação está ativa, só o filtro de
   * turmas (`combinacoes`) vale.
   */
  dataGoLive: Date;
}

export interface ErpFrequencyProvider {
  readonly erpSistema: string;
  sendPendingFrequencies(
    instituicaoCodigo: number,
    filtro?: ImplantacaoFiltro,
  ): Promise<ErpFrequencySendResult>;
}
