import { IsArray, IsString, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CursoImplantacaoItemDto {
  @IsString()
  @IsNotEmpty()
  curso: string;

  @IsString()
  @IsNotEmpty()
  serie: string;

  @IsString()
  @IsNotEmpty()
  turma: string;
}

export class ReplaceCursosImplantacaoDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CursoImplantacaoItemDto)
  combinacoes: CursoImplantacaoItemDto[];
}
