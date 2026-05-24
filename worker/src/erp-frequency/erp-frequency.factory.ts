import { PrismaClient } from '@prisma/client';
import { ErpFrequencyProvider } from './erp-frequency.types';
import { GenneraFrequencyService } from './brands/gennera/gennera-frequency.service';
import { NoopFrequencyProvider } from './brands/noop/noop-frequency.provider';

type ErpConfig = Awaited<ReturnType<PrismaClient['eRPConfiguracao']['findFirst']>>;

export class ErpFrequencyFactory {
  static create(erpConfig: ErpConfig, prisma: PrismaClient): ErpFrequencyProvider {
    if (erpConfig?.ERPSistema === 'Gennera' && erpConfig?.ERPUrlBase) {
      return new GenneraFrequencyService(prisma, erpConfig);
    }
    return new NoopFrequencyProvider();
  }
}
