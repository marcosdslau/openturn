import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateClienteDto {
    @IsString()
    CLINome: string;

    @IsOptional()
    @IsString()
    CLIDocumento?: string;

    @IsOptional()
    @IsBoolean()
    CLIAtivo?: boolean;
}

export class UpdateClienteDto {
    @IsOptional()
    @IsString()
    CLINome?: string;

    @IsOptional()
    @IsString()
    CLIDocumento?: string;

    @IsOptional()
    @IsBoolean()
    CLIAtivo?: boolean;
}
