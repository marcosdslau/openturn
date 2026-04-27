import { EQPEquipamento } from '@prisma/client';
import { HardwareEquipmentConfigType } from './hardware.types';

export interface IHardwareEquipmentConfiguration {
  applyEquipmentConfiguration(
    device: EQPEquipamento,
    type: HardwareEquipmentConfigType,
  ): Promise<unknown>;
}