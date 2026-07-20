import { IsString, IsNotEmpty } from 'class-validator';

export class SalvarFotoDto {
  @IsString()
  @IsNotEmpty({ message: 'Foto é obrigatória.' })
  fotoBase64: string;
}
