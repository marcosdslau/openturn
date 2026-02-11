import { IsString, IsOptional, MinLength, IsUrl } from 'class-validator';

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
    @IsUrl()
    fotoUrl?: string;

    // Social links
    @IsOptional()
    @IsUrl()
    facebook?: string;

    @IsOptional()
    @IsUrl()
    twitter?: string;

    @IsOptional()
    @IsUrl()
    linkedin?: string;

    @IsOptional()
    @IsUrl()
    instagram?: string;

    // Address information
    @IsOptional()
    @IsString()
    pais?: string;

    @IsOptional()
    @IsString()
    cidade?: string;

    @IsOptional()
    @IsString()
    estado?: string;

    @IsOptional()
    @IsString()
    cep?: string;

    @IsOptional()
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
