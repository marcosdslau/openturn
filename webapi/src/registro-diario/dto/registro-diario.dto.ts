import { IsOptional, IsInt, IsDateString, IsString, IsArray, IsBoolean, Min, Max, Matches } from 'class-validator';
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
  @IsArray()
  @IsString({ each: true })
  MATCurso?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  MATSerie?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  MATTurma?: string[];

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cursos?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  series?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  turmas?: string[];

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

  /** Somente quando considerarHorarioPassagens = false: enviar intervalo de horário fixo */
  @IsOptional()
  @IsBoolean()
  usarIntervaloHorario?: boolean;

  /** HH:mm no fuso da instituição — obrigatório se usarIntervaloHorario = true */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'horaEntradaIntervalo deve estar no formato HH:mm' })
  horaEntradaIntervalo?: string;

  /** HH:mm no fuso da instituição — obrigatório se usarIntervaloHorario = true */
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'horaSaidaIntervalo deve estar no formato HH:mm' })
  horaSaidaIntervalo?: string;
}
