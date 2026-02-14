import { IsString, IsNotEmpty, IsOptional, IsObject, IsUrl } from 'class-validator';

export class UpdateERPConfigDto {
    @IsString()
    @IsNotEmpty()
    ERPSistema: string;

    @IsUrl()
    @IsOptional()
    ERPUrlBase?: string;

    @IsString()
    @IsOptional()
    ERPToken?: string;

    @IsObject()
    @IsOptional()
    ERPConfigJson?: any;
}
