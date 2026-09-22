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

  /**
   * Departamento da instituição. Áreas, horários e regras vêm dele, configurados por equipamento —
   * a turma não define horário nenhum.
   */
  @ValidateIf((o: TurmaValidacaoDto) => o.ativa === true)
  @IsInt({ message: 'Informe o departamento da turma' })
  DEPCodigo?: number;

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

