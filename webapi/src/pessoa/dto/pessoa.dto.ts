import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';

export class CreatePessoaDto {
    @IsString()
    PESNome: string;

    @IsOptional()
    @IsString()
    PESNomeSocial?: string;

    @IsOptional()
    @IsString()
    PESDocumento?: string;

    @IsOptional()
    @IsString()
    PESEmail?: string;

    @IsOptional()
    @IsString()
    PESTelefone?: string;

    @IsOptional()
    @IsString()
    PESCelular?: string;

    @IsOptional()
    @IsString()
    PESGrupo?: string;

    @IsOptional()
    @IsString()
    PESCartaoTag?: string;

    @IsOptional()
    @IsString()
    PESIdExterno?: string;

    @IsInt()
    INSInstituicaoCodigo: number;
}

export class UpdatePessoaDto {
    @IsOptional()
    @IsString()
    PESNome?: string;

    @IsOptional()
    @IsString()
    PESNomeSocial?: string;

    @IsOptional()
    @IsString()
    PESDocumento?: string;

    @IsOptional()
    @IsString()
    PESEmail?: string;

    @IsOptional()
    @IsString()
    PESTelefone?: string;

    @IsOptional()
    @IsString()
    PESCelular?: string;

    @IsOptional()
    @IsString()
    PESGrupo?: string;

    @IsOptional()
    @IsString()
    PESCartaoTag?: string;

    @IsOptional()
    @IsBoolean()
    PESAtivo?: boolean;
}
