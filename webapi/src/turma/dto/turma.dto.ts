import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
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

export class TurmaValidacaoDto {
  @IsBoolean()
  ativa: boolean;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TurmaHorarioDto)
  horarios: TurmaHorarioDto[];

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
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TurmaHorarioDto)
  horarios: TurmaHorarioDto[];

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
