import { IsString, IsEmail, MinLength, IsOptional, IsEnum, IsInt } from 'class-validator';
import { GrupoAcesso } from '@prisma/client';

export class CreateUsuarioDto {
    @IsString({ message: 'Nome deve ser uma string' })
    nome: string;

    @IsEmail({}, { message: 'Email inválido' })
    email: string;

    @IsString({ message: 'Senha deve ser uma string' })
    @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
    senha: string;
}

export class UpdateUsuarioDto {
    @IsOptional()
    @IsString()
    nome?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    @MinLength(6)
    senha?: string;
}

export class CreateAcessoDto {
    @IsEnum(GrupoAcesso, { message: 'Grupo inválido' })
    grupo: GrupoAcesso;

    @IsOptional()
    @IsInt()
    clienteId?: number;

    @IsOptional()
    @IsInt()
    instituicaoId?: number;
}
