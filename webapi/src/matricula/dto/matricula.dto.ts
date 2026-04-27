import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

function trimOrUndefined({ value }: { value: unknown }) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
}

function toStringArray({ value }: { value: unknown }): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const out = arr
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return out.length ? out : undefined;
}

export class CreateMatriculaDto {
  @IsInt()
  PESCodigo: number;

  @IsString()
  MATNumero: string;

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
  @IsInt()
  INSInstituicaoCodigo?: number;
}

export class UpdateMatriculaDto {
  @IsOptional()
  @IsString()
  MATNumero?: string;

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
  @IsBoolean()
  MATAtivo?: boolean;
}

export class QueryMatriculaDto extends PaginationDto {
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(120)
  numero?: string;

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  curso?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  serie?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  turma?: string[];
}
