import { IsString, IsEmail, MinLength, IsEnum, IsOptional } from 'class-validator';
import { GrupoAcesso } from '@prisma/client';

export class CreateAdminUsuarioDto {
    @IsString({ message: 'Nome deve ser uma string' })
    nome: string;

    @IsEmail({}, { message: 'Email inválido' })
    email: string;

    @IsString({ message: 'Senha deve ser uma string' })
    @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
    senha: string;

    @IsEnum(GrupoAcesso, { message: 'Grupo inválido' })
    grupo: GrupoAcesso;
}

export class UpdateAdminUsuarioDto {
    @IsOptional()
    @IsString()
    nome?: string;

    @IsOptional()
    @IsEmail()
    email?: string;
}

export class ResetPasswordDto {
    @IsString({ message: 'Nova senha deve ser uma string' })
    @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
    newPassword: string;
}
