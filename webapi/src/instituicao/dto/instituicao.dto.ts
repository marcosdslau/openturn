import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class CreateInstituicaoDto {
    @IsInt()
    CLICodigo: number;

    @IsString()
    INSNome: string;

    @IsOptional()
    @IsString()
    INSCodigoExterno?: string;

    @IsOptional()
    @IsBoolean()
    INSAtivo?: boolean;

    @IsOptional()
    @IsBoolean()
    INSLogsAutoExcluir?: boolean;

    @IsOptional()
    @IsInt()
    INSLogsDiasRetencao?: number;
}

export class UpdateInstituicaoDto {
    @IsOptional()
    @IsString()
    INSNome?: string;

    @IsOptional()
    @IsString()
    INSCodigoExterno?: string;

    @IsOptional()
    @IsBoolean()
    INSAtivo?: boolean;

    @IsOptional()
    @IsBoolean()
    INSLogsAutoExcluir?: boolean;

    @IsOptional()
    @IsInt()
    INSLogsDiasRetencao?: number;
}
