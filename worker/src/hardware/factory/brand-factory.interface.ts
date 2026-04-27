import { EQPEquipamento } from '@prisma/client';
import { IHardwareProvider } from '../interfaces/hardware-provider.interface';

export interface IBrandFactory {
  resolve(
    equipment: EQPEquipamento,
    overrideHost?: string,
  ): Promise<IHardwareProvider>;
}
