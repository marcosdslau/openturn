import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreatePeriodoRegistroDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  PERNome: string;

  @IsString()
  @Matches(HHMM_REGEX, { message: 'PERHorarioInicio deve estar no formato HH:mm (ex: 08:00)' })
  PERHorarioInicio: string;

  @IsString()
  @Matches(HHMM_REGEX, { message: 'PERHorarioFim deve estar no formato HH:mm (ex: 12:00)' })
  PERHorarioFim: string;

  @IsInt()
  @Min(0)
  @Max(720)
  PERToleranciaEntradaMinutos: number;

  @IsInt()
  @Min(0)
  @Max(720)
  PERToleranciaSaidaMinutos: number;
}

export class UpdatePeriodoRegistroDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  PERNome?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: 'PERHorarioInicio deve estar no formato HH:mm (ex: 08:00)' })
  PERHorarioInicio?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: 'PERHorarioFim deve estar no formato HH:mm (ex: 12:00)' })
  PERHorarioFim?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  PERToleranciaEntradaMinutos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  PERToleranciaSaidaMinutos?: number;
}
