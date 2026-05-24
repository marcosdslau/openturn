import { PrismaClient } from '@prisma/client';
import { ErpFrequencyFactory } from './erp-frequency.factory';
import { workerLogLine } from '../worker-log';

export class ErpFrequencySyncOrchestrator {
  constructor(private readonly prisma: PrismaClient) {}

  async run(instituicaoCodigo: number): Promise<void> {
    const erpConfig = await this.prisma.eRPConfiguracao.findFirst({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
    });

    const provider = ErpFrequencyFactory.create(erpConfig, this.prisma);
    const result = await provider.sendPendingFrequencies(instituicaoCodigo);

    console.log(
      workerLogLine(
        `[FREQ_ERP_SYNC] inst=${instituicaoCodigo} erp=${erpConfig?.ERPSistema ?? 'none'} enviados=${result.enviados} erros=${result.erros} ignorados=${result.ignorados}`,
      ),
    );
  }
}
