import { IsOptional, IsInt, IsDateString, IsString, IsArray, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/** Paginação própria: limite até 1000 (lista administrativa de registros). */
export class QueryRegistroDiarioDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PESCodigo?: number;

  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  documento?: string;

  @IsOptional()
  @IsString()
  grupo?: string;

  @IsOptional()
  @IsString()
  MATCurso?: string;

  @IsOptional()
  @IsString()
  MATSerie?: string;

  @IsOptional()
  @IsString()
  MATTurma?: string;

  @IsOptional()
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string;
}

export class IniciarLancamentoGenneraDto {
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  pessoasCodigos?: number[];

  @IsDateString()
  dataInicio: string;

  @IsDateString()
  dataFim: string;

  @IsBoolean()
  considerarHorarioPassagens: boolean;

  /** Somente quando considerarHorarioPassagens = false */
  @IsOptional()
  @IsBoolean()
  lancaPresenca?: boolean;
}
