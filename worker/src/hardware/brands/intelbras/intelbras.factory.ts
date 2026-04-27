import { PrismaClient, EQPEquipamento } from '@prisma/client';
import { IHardwareProvider } from '../../interfaces/hardware-provider.interface';
import { IBrandFactory } from '../../factory/brand-factory.interface';
import { IntelbrasDefaultProvider } from './models/intelbras-default.provider';

export class IntelbrasBrandFactory implements IBrandFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(
    equipment: EQPEquipamento,
    _overrideHost?: string,
  ): Promise<IHardwareProvider> {
    return new IntelbrasDefaultProvider(equipment.EQPConfig, this.prisma);
  }
}
