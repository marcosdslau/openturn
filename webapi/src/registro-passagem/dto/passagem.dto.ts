import {
  IsInt,
  IsEnum,
  IsOptional,
  IsDateString,
  IsString,
  MaxLength,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AcaoPassagem } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

function trimOrUndefined({ value }: { value: unknown }) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
}

function toStringArray({ value }: { value: unknown }): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
      .filter((v) => v !== '');
  }
  const s = typeof value === 'string' ? value.trim() : String(value).trim();
  return s ? [s] : undefined;
}

export class CreatePassagemDto {
  @IsInt()
  PESCodigo: number;

  @IsEnum(AcaoPassagem)
  REGAcao: AcaoPassagem;

  @IsInt()
  EQPCodigo: number;

  @IsInt()
  INSInstituicaoCodigo: number;
}

export class QueryPassagemDto extends PaginationDto {
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(64)
  documento?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(120)
  grupo?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(120)
  cartaoTag?: string;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PESCodigo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  EQPCodigo?: number;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsDateString()
  dataInicio?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsDateString()
  dataFim?: string;

  @IsOptional()
  @IsEnum(AcaoPassagem)
  REGAcao?: AcaoPassagem;
}

export class UpdatePassagemDto {
  @IsOptional()
  @IsEnum(AcaoPassagem)
  REGAcao?: AcaoPassagem;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  EQPCodigo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PESCodigo?: number;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsDateString()
  REGDataHora?: string;
}
