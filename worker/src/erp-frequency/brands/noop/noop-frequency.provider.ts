import { ErpFrequencyProvider, ErpFrequencySendResult } from '../../erp-frequency.types';

export class NoopFrequencyProvider implements ErpFrequencyProvider {
  readonly erpSistema = 'noop';

  async sendPendingFrequencies(_instituicaoCodigo: number): Promise<ErpFrequencySendResult> {
    return { enviados: 0, erros: 0, ignorados: 0 };
  }
}
