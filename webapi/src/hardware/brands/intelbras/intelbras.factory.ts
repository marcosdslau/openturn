import { Injectable } from '@nestjs/common';
import { EQPEquipamento } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IHardwareProvider } from '../../interfaces/hardware-provider.interface';
import { IBrandFactory } from '../../factory/brand-factory.interface';
import { IntelbrasDefaultProvider } from './models/intelbras-default.provider';

@Injectable()
export class IntelbrasBrandFactory implements IBrandFactory {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    equipment: EQPEquipamento,
    _overrideHost?: string,
  ): Promise<IHardwareProvider> {
    return new IntelbrasDefaultProvider(equipment.EQPConfig, this.prisma);
  }
}
