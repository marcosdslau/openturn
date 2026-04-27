import { IsEnum } from 'class-validator';
import { HardwareEquipmentConfigType } from '../interfaces/hardware.types';

export class ConfigureEquipmentDto {
  @IsEnum(HardwareEquipmentConfigType)
  type!: HardwareEquipmentConfigType;
}
