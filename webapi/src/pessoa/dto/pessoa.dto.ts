import { IsString, IsOptional, IsBoolean, IsInt, MaxLength, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

function trimOrUndefined({ value }: { value: unknown }) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? undefined : t;
}

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

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000)
    PESLimiarFacial?: number;

    @IsOptional()
    @IsBoolean()
    PESGemeo?: boolean;

    @IsOptional()
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
    @IsString()
    PESFotoBase64?: string | null;

    @IsOptional()
    @IsString()
    PESFotoExtensao?: string | null;

    @IsOptional()
    @IsBoolean()
    PESAtivo?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1000)
    PESLimiarFacial?: number;

    @IsOptional()
    @IsBoolean()
    PESGemeo?: boolean;
}

export class QueryPessoaDto extends PaginationDto {
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
    @Transform(({ value }) => {
        if (value === undefined || value === null || value === '') return undefined;
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        return value;
    })
    @IsBoolean()
    ativo?: boolean;
}
