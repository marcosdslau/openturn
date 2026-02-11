import { IsString, IsOptional, MinLength, IsUrl, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    nome?: string;

    @IsOptional()
    @IsString()
    telefone?: string;

    @IsOptional()
    @IsString()
    bio?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsUrl()
    fotoUrl?: string;

    // Social links
    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsUrl()
    facebook?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsUrl()
    twitter?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsUrl()
    linkedin?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsUrl()
    instagram?: string;

    // Address information
    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsString()
    pais?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsString()
    cidade?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsString()
    estado?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsString()
    cep?: string;

    @IsOptional()
    @ValidateIf((o, v) => v !== '' && v !== null)
    @IsString()
    taxId?: string;
}

export class ChangePasswordDto {
    @IsString({ message: 'Senha atual é obrigatória' })
    currentPassword: string;

    @IsString({ message: 'Nova senha é obrigatória' })
    @MinLength(6, { message: 'Nova senha deve ter no mínimo 6 caracteres' })
    newPassword: string;
}
