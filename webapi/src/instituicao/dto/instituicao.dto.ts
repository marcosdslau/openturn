
import { IsString, IsOptional, IsBoolean, IsInt, IsObject, Min } from 'class-validator';

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

    @IsOptional()
    @IsInt()
    @Min(1)
    INSMaxExecucoesSimultaneas?: number;

    @IsOptional()
    @IsBoolean()
    INSWorkerAtivo?: boolean;

    @IsOptional()
    @IsObject()
    INSConfigHardware?: any;
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

    @IsOptional()
    @IsInt()
    @Min(1)
    INSMaxExecucoesSimultaneas?: number;

    @IsOptional()
    @IsBoolean()
    INSWorkerAtivo?: boolean;

    @IsOptional()
    @IsObject()
    INSConfigHardware?: any;
}

export class SetWorkerStatusBodyDto {
    @IsBoolean()
    active: boolean;
}
