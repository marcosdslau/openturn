import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
    @IsEmail({}, { message: 'E-mail inválido' })
    @IsNotEmpty({ message: 'E-mail é obrigatório' })
    email: string;
}
