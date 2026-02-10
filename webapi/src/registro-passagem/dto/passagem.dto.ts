import { IsInt, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { AcaoPassagem } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

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
    @Type(() => Number)
    @IsInt()
    PESCodigo?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    EQPCodigo?: number;

    @IsOptional()
    @IsDateString()
    dataInicio?: string;

    @IsOptional()
    @IsDateString()
    dataFim?: string;

    @IsOptional()
    @IsEnum(AcaoPassagem)
    REGAcao?: AcaoPassagem;
}
