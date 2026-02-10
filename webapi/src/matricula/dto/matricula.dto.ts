import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';

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

    @IsInt()
    INSInstituicaoCodigo: number;
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
