import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsObject,
  Matches,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';

/** Cron 5 campos (padrão rotinas / CronBuilder) ou 6 campos (seg min hora dom mês dow, legado). */
const CRON_5_OR_6_FIELDS = /^(\S+\s){4}\S+$|^(\S+\s){5}\S+$/;

export class CreateInstituicaoDto {
  @IsInt()
  CLICodigo: number;

  @IsString()
  INSNome: string;

  @IsOptional()
  @IsString()
  INSCodigoExterno?: string;

  @IsOptional()
  @IsBoolean()
  INSAtivo?: boolean;

  @IsOptional()
  @IsBoolean()
  INSLogsAutoExcluir?: boolean;

  @IsOptional()
  @IsInt()
  INSLogsDiasRetencao?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  INSMaxExecucoesSimultaneas?: number;

  @IsOptional()
  @IsBoolean()
  INSWorkerAtivo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-12)
  @Max(14)
  INSFusoHorario?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  INSToleranciaEntradaMinutos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  INSToleranciaSaidaMinutos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  INSTLimiarFacialDefault?: number;

  @IsOptional()
  @IsObject()
  INSConfigHardware?: any;

  @IsOptional()
  @IsBoolean()
  INSControlidMonitorRotinaAtiva?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  INSControlidMonitorRotinaCodigo?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  INSRotinaPessoasCodigo?: number | null;

  @IsOptional()
  @IsString()
  @Matches(CRON_5_OR_6_FIELDS, {
    message:
      'INSTempoSync: use cron de 5 campos (min hora dom mês dow, como nas rotinas) ou 6 campos (seg min hora …)',
  })
  INSTempoSync?: string;

  @IsOptional()
  @IsBoolean()
  INSSyncRegistrosDiarios?: boolean;
}

export class UpdateInstituicaoDto {
  @IsOptional()
  @IsString()
  INSNome?: string;

  @IsOptional()
  @IsString()
  INSCodigoExterno?: string;

  @IsOptional()
  @IsBoolean()
  INSAtivo?: boolean;

  @IsOptional()
  @IsBoolean()
  INSLogsAutoExcluir?: boolean;

  @IsOptional()
  @IsInt()
  INSLogsDiasRetencao?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  INSMaxExecucoesSimultaneas?: number;

  @IsOptional()
  @IsBoolean()
  INSWorkerAtivo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-12)
  @Max(14)
  INSFusoHorario?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  INSToleranciaEntradaMinutos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  INSToleranciaSaidaMinutos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  INSTLimiarFacialDefault?: number;

  @IsOptional()
  @IsObject()
  INSConfigHardware?: any;

  @IsOptional()
  @IsBoolean()
  INSControlidMonitorRotinaAtiva?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  INSControlidMonitorRotinaCodigo?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  INSRotinaPessoasCodigo?: number | null;

  @IsOptional()
  @IsString()
  @Matches(CRON_5_OR_6_FIELDS, {
    message:
      'INSTempoSync: use cron de 5 campos (min hora dom mês dow, como nas rotinas) ou 6 campos (seg min hora …)',
  })
  INSTempoSync?: string;

  @IsOptional()
  @IsBoolean()
  INSSyncRegistrosDiarios?: boolean;
}

export class SetWorkerStatusBodyDto {
  @IsBoolean()
  active: boolean;
}
