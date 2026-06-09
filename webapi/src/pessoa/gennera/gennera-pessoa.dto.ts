import { IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

function trimOrUndefined({ value }: { value: unknown }) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
}

export class BuscarGenneraPessoaQueryDto {
  @Transform(trimOrUndefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;
}

export class SincronizarGenneraPessoasDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  idPersons?: number[];
}
