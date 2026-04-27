
import { IsString, IsOptional, IsBoolean, IsInt, IsObject, Min, Max, ValidateIf } from 'class-validator';

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
    @IsInt()
    @Min(-12)
    @Max(14)
    INSFusoHorario?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(10080)
    INSToleranciaEntradaMinutos?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(10080)
    INSToleranciaSaidaMinutos?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000)
    INSTLimiarFacialDefault?: number;

    @IsOptional()
    @IsObject()
    INSConfigHardware?: any;

    @IsOptional()
    @IsBoolean()
    INSControlidMonitorRotinaAtiva?: boolean;

    @IsOptional()
    @ValidateIf((_, v) => v !== null && v !== undefined)
    @IsInt()
    INSControlidMonitorRotinaCodigo?: number | null;
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
    @IsInt()
    @Min(-12)
    @Max(14)
    INSFusoHorario?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(10080)
    INSToleranciaEntradaMinutos?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(10080)
    INSToleranciaSaidaMinutos?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000)
    INSTLimiarFacialDefault?: number;

    @IsOptional()
    @IsObject()
    INSConfigHardware?: any;

    @IsOptional()
    @IsBoolean()
    INSControlidMonitorRotinaAtiva?: boolean;

    @IsOptional()
    @ValidateIf((_, v) => v !== null && v !== undefined)
    @IsInt()
    INSControlidMonitorRotinaCodigo?: number | null;
}

export class SetWorkerStatusBodyDto {
    @IsBoolean()
    active: boolean;
}
