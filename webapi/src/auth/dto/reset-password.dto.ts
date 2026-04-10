import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
    @IsString({ message: 'Token inválido' })
    @IsNotEmpty({ message: 'Token é obrigatório' })
    token: string;

    @IsString({ message: 'Nova senha é obrigatória' })
    @MinLength(6, { message: 'Nova senha deve ter no mínimo 6 caracteres' })
    novaSenha: string;
}
