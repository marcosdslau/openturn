import { IsInt, IsOptional } from 'class-validator';

export class SwitchContextDto {
    @IsOptional()
    @IsInt({ message: 'clienteId deve ser um número inteiro' })
    clienteId?: number;

    @IsOptional()
    @IsInt({ message: 'instituicaoId deve ser um número inteiro' })
    instituicaoId?: number;
}
