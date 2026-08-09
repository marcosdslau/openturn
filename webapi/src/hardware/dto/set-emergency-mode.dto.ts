import { IsBoolean } from 'class-validator';

export class SetEmergencyModeDto {
  /** `true` ativa o modo de emergência (giro liberado); `false` desativa. */
  @IsBoolean()
  emergencyMode!: boolean;
}
