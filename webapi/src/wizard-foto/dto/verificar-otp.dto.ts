import { IsString, Length } from 'class-validator';

export class VerificarOtpDto {
  @IsString()
  @Length(6, 6, { message: 'O código deve ter exatamente 6 dígitos.' })
  codigo: string;
}
