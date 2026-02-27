import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';

export class CreateEquipamentoDto {
    @IsOptional()
    @IsString()
    EQPDescricao?: string;

    @IsOptional()
    @IsString()
    EQPMarca?: string;

    @IsOptional()
    @IsString()
    EQPModelo?: string;

    @IsOptional()
    @IsString()
    EQPEnderecoIp?: string;

    @IsOptional()
    @IsBoolean()
    EQPUsaAddon?: boolean;

    @IsOptional()
    @IsInt()
    INSInstituicaoCodigo?: number;
}

export class UpdateEquipamentoDto {
    @IsOptional()
    @IsString()
    EQPDescricao?: string;

    @IsOptional()
    @IsString()
    EQPMarca?: string;

    @IsOptional()
    @IsString()
    EQPModelo?: string;

    @IsOptional()
    @IsString()
    EQPEnderecoIp?: string;

    @IsOptional()
    @IsBoolean()
    EQPUsaAddon?: boolean;

    @IsOptional()
    @IsBoolean()
    EQPAtivo?: boolean;

    @IsOptional()
    EQPConfig?: any;
}
