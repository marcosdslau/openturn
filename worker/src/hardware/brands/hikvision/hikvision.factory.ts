import { PrismaClient, EQPEquipamento } from '@prisma/client';
import { IHardwareProvider } from '../../interfaces/hardware-provider.interface';
import { IBrandFactory } from '../../factory/brand-factory.interface';
import { HikvisionDefaultProvider } from './models/hikvision-default.provider';

export class HikvisionBrandFactory implements IBrandFactory {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(
    equipment: EQPEquipamento,
    _overrideHost?: string,
  ): Promise<IHardwareProvider> {
    return new HikvisionDefaultProvider(equipment.EQPConfig, this.prisma);
  }
}
