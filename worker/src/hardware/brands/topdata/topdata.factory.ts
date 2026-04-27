import { PrismaClient, EQPEquipamento } from '@prisma/client';
import { IHardwareProvider } from '../../interfaces/hardware-provider.interface';
import { IBrandFactory } from '../../factory/brand-factory.interface';
import { TopdataDefaultProvider } from './models/topdata-default.provider';

export class TopdataBrandFactory implements IBrandFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(
    equipment: EQPEquipamento,
    _overrideHost?: string,
  ): Promise<IHardwareProvider> {
    return new TopdataDefaultProvider(equipment.EQPConfig, this.prisma);
  }
}
