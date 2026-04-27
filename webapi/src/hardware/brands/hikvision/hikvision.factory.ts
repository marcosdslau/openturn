import { Injectable } from '@nestjs/common';
import { EQPEquipamento } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { IHardwareProvider } from '../../interfaces/hardware-provider.interface';
import { IBrandFactory } from '../../factory/brand-factory.interface';
import { HikvisionDefaultProvider } from './models/hikvision-default.provider';

@Injectable()
export class HikvisionBrandFactory implements IBrandFactory {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    equipment: EQPEquipamento,
    _overrideHost?: string,
  ): Promise<IHardwareProvider> {
    return new HikvisionDefaultProvider(equipment.EQPConfig, this.prisma);
  }
}
