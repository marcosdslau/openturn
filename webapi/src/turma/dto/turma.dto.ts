import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * DTOs validam apenas FORMATO. As regras de negócio (sobreposição, escopo, limite de nome)
 * ficam no núcleo, porque rotinas chamam o núcleo sem passar por aqui.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const paraBooleano = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : value === true || value === 'true';

export class TurmaHorarioDto {
  @Matches(HHMM, { message: 'inicio deve estar no formato HH:mm' })
  inicio: string;

  @Matches(HHMM, { message: 'fim deve estar no formato HH:mm' })
  fim: string;

  /** dom..sab */
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsBoolean({ each: true })
  dias: boolean[];
}

export class TurmaEscopoDto {
  @IsBoolean()
  todos: boolean;

  @ValidateIf((o: TurmaEscopoDto) => o.todos === false)
  @IsArray()
  @ArrayNotEmpty({ message: 'Selecione ao menos um equipamento' })
  @IsInt({ each: true })
  EQPCodigos?: number[];
}

export class RegraSentidoDto {
  /** livre = sempre liberado; horario = só nas faixas; bloqueado = sem permissão nesse sentido. */
  @IsIn(['livre', 'horario', 'bloqueado'])
  modo: 'livre' | 'horario' | 'bloqueado';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TurmaHorarioDto)
  horarios?: TurmaHorarioDto[];
}

/** Regra independente para cada sentido (SpecControlId.md). */
export class RegrasSentidoDto {
  /** Entrada na Área Interna — entrar na escola. */
  @IsObject({ message: 'Informe a regra de entrada na Área Interna' })
  @ValidateNested()
  @Type(() => RegraSentidoDto)
  interna: RegraSentidoDto;

  /** Entrada na Área Externa — sair da escola. */
  @IsObject({ message: 'Informe a regra de entrada na Área Externa' })
  @ValidateNested()
  @Type(() => RegraSentidoDto)
  externa: RegraSentidoDto;
}

export class TurmaValidacaoDto {
  @IsBoolean()
  ativa: boolean;

  @ValidateIf((o: TurmaValidacaoDto) => o.ativa === true)
  @IsObject({ message: 'Informe as regras de entrada e saída' })
  @ValidateNested()
  @Type(() => RegrasSentidoDto)
  regras?: RegrasSentidoDto;

  @ValidateNested()
  @Type(() => TurmaEscopoDto)
  escopo: TurmaEscopoDto;
}

export class TurmaValidacaoLoteDto extends TurmaValidacaoDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  TRMCodigos: number[];
}

export class TurmaSincronizarDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  EQPCodigos?: number[];

  @IsOptional()
  @IsBoolean()
  forcar?: boolean;
}

export class PerfilPreviewDto {
  @IsObject({ message: 'Informe as regras de entrada e saída' })
  @ValidateNested()
  @Type(() => RegrasSentidoDto)
  regras: RegrasSentidoDto;

  @IsOptional()
  @IsInt()
  TRMCodigo?: number;
}

export class PerfilRenomearDto {
  @IsString()
  @MaxLength(60)
  nome: string;
}

export class ParImportacaoDto {
  @IsInt()
  TRMCodigoOrigem: number;

  @IsInt()
  TRMCodigoDestino: number;
}

export class ImportacaoAnoAnteriorDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ParImportacaoDto)
  pares: ParImportacaoDto[];
}

export class TurmaPessoasFiltroDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  /** Nome, nome social ou número da matrícula. */
  @IsOptional() @IsString() busca?: string;
}

export class TurmaFiltroDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional() @IsString() ano?: string;
  @IsOptional() @IsString() curso?: string;
  @IsOptional() @IsString() serie?: string;
  @IsOptional() @IsString() turno?: string;
  @IsOptional() @IsString() busca?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perfil?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  equipamento?: number;

  @IsOptional()
  @Transform(paraBooleano)
  @IsBoolean()
  validacaoAtiva?: boolean;

  /** `true` (padrão), `false` ou `todas`. */
  @IsOptional()
  @IsIn(['true', 'false', 'todas'])
  ativa?: 'true' | 'false' | 'todas';
}

export class SentidoEquipamentoDto {
  /** true = portais trocados em relação ao giro físico (resultado do teste em bancada). */
  @IsOptional()
  @IsBoolean()
  invertido?: boolean;

  /** true = teste funcional em bancada confirmado. */
  @IsOptional()
  @IsBoolean()
  validado?: boolean;
}
