import { IsString, IsOptional } from 'class-validator';

export class PairConnectorDto {
    @IsString()
    CONNome: string;
}

export class ProxyHttpDto {
    @IsString()
    method: string;

    @IsString()
    path: string;

    @IsOptional()
    headers?: Record<string, string>;

    @IsOptional()
    body?: any;
}
