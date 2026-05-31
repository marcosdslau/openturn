import {
  IsOptional,
  IsInt,
  IsString,
  IsBoolean,
  IsArray,
  IsDateString,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------------
// Filtros base — reutilizados em preview e criação manual
// ---------------------------------------------------------------------------

export class ManutencaoFiltrosDto {
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  pessoasCodigos?: number[];

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

  /** ISO datetime — filtro por RPDDataEntrada >= dataHoraInicio */
  @IsOptional()
  @IsDateString()
  dataHoraInicio?: string;

  /** ISO datetime — filtro por RPDDataSaida <= dataHoraFim */
  @IsOptional()
  @IsDateString()
  dataHoraFim?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  entradasVazias?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  saidasVazias?: boolean;
}

// ---------------------------------------------------------------------------
// Query paginada de manutenção
// ---------------------------------------------------------------------------

export class QueryManutencaoRegistroDiarioDto extends ManutencaoFiltrosDto {
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
}

// ---------------------------------------------------------------------------
// Reprocessar período
// ---------------------------------------------------------------------------

export class ReprocessarPeriodoDto {
  /** ISO date (YYYY-MM-DD) */
  @IsDateString()
  dataInicio: string;

  /** ISO date (YYYY-MM-DD) */
  @IsDateString()
  dataFim: string;
}

// ---------------------------------------------------------------------------
// Criar manual — janela individual HH:mm
// ---------------------------------------------------------------------------

export class JanelaDesejadaDto {
  @IsString()
  @Matches(HHMM_REGEX, { message: 'horaEntrada deve estar no formato HH:mm' })
  horaEntrada: string;

  @IsString()
  @Matches(HHMM_REGEX, { message: 'horaSaida deve estar no formato HH:mm' })
  horaSaida: string;
}

export class CriarManualRegistroDiarioDto {
  @ValidateNested()
  @Type(() => ManutencaoFiltrosDto)
  filtros: ManutencaoFiltrosDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => JanelaDesejadaDto)
  janelasDesejadas: JanelaDesejadaDto[];
}

// ---------------------------------------------------------------------------
// Alterar em lote
// ---------------------------------------------------------------------------

export class AlterarRegistrosDiariosDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  rpdCodigos: number[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  alterarEntrada?: boolean;

  /** ISO datetime da nova entrada */
  @IsOptional()
  @IsDateString()
  novaEntrada?: string;

  /** Hora local (HH:mm) da nova entrada; combinada com a data de cada registro selecionado. */
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: 'novaEntradaHora deve estar no formato HH:mm' })
  novaEntradaHora?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  alterarSaida?: boolean;

  /** ISO datetime da nova saída */
  @IsOptional()
  @IsDateString()
  novaSaida?: string;

  /** Hora local (HH:mm) da nova saída; combinada com a data de cada registro selecionado. */
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: 'novaSaidaHora deve estar no formato HH:mm' })
  novaSaidaHora?: string;
}

// ---------------------------------------------------------------------------
// Excluir em lote
// ---------------------------------------------------------------------------

export class ExcluirRegistrosDiariosDto {
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  rpdCodigos: number[];
}

// ---------------------------------------------------------------------------
// Edição unitária (PATCH /:rpdCodigo)
// ---------------------------------------------------------------------------

export class UpdateRegistroDiarioDto {
  /** ISO datetime */
  @IsOptional()
  @IsDateString()
  RPDDataEntrada?: string;

  /** ISO datetime */
  @IsOptional()
  @IsDateString()
  RPDDataSaida?: string;
}
