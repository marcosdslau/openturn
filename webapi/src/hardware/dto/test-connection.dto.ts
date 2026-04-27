import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class TestConnectionDto {
  @IsString()
  @IsNotEmpty()
  EQPMarca!: string;

  @IsOptional()
  @IsString()
  EQPModelo?: string | null;

  @IsOptional()
  @IsBoolean()
  EQPUsaAddon?: boolean;

  @IsOptional()
  EQPConfig?: any;

  @IsString()
  @IsNotEmpty()
  ip!: string;
}
