import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';

export class BulkExecucoesDto {
  @IsIn(['delete', 'reprocess', 'cancel'])
  action: 'delete' | 'reprocess' | 'cancel';

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
