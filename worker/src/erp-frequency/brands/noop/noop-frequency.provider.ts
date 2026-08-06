import { ErpFrequencyProvider, ErpFrequencySendResult, ImplantacaoFiltro } from '../../erp-frequency.types';

export class NoopFrequencyProvider implements ErpFrequencyProvider {
  readonly erpSistema = 'noop';

  async sendPendingFrequencies(
    _instituicaoCodigo: number,
    _filtro?: ImplantacaoFiltro,
  ): Promise<ErpFrequencySendResult> {
    return { enviados: 0, erros: 0, ignorados: 0 };
  }
}
