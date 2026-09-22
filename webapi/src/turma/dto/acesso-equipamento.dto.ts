import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Configuração de acesso por equipamento (áreas, portais, horários).
 *
 * DTOs validam apenas FORMATO. Regra de negócio (sobreposição de faixas, limite de bytes do nome,
 * área pertencer ao equipamento) fica no núcleo, que também é chamado por rotinas sem passar aqui.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** No fim da faixa, "24:00" = fim do dia — o firmware guarda como 86399. */
const HHMM_FIM = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;

export class AreaNomeDto {
  @IsString()
  @MaxLength(60)
  nome: string;
}

export class PortalCriarDto {
  /** Quem passa SAI desta área. */
  @IsInt()
  areaDeCodigo: number;

  /** …e ENTRA nesta. É o que define o sentido. */
  @IsInt()
  areaParaCodigo: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nome?: string;
}

export class JanelaDeviceDto {
  @Matches(HHMM, { message: 'inicio deve estar no formato HH:mm' })
  inicio: string;

  @Matches(HHMM_FIM, { message: 'fim deve estar no formato HH:mm (ou 24:00)' })
  fim: string;

  /** dom..sab */
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsBoolean({ each: true })
  dias: boolean[];

  /** hol1..hol3 */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsBoolean({ each: true })
  feriados?: boolean[];
}

export class HorarioCriarDto {
  @IsString()
  @MaxLength(60)
  nome: string;

  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => JanelaDeviceDto)
  janelas: JanelaDeviceDto[];

  /** Áreas cuja ENTRADA este horário libera. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ARECodigos?: number[];
}

export class HorarioAtualizarDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nome?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => JanelaDeviceDto)
  janelas?: JanelaDeviceDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ARECodigos?: number[];
}

export class DepartamentoCriarDto {
  @IsString()
  @MaxLength(60)
  nome: string;

  /** Reaproveita um departamento da instituição em vez de criar outro com o mesmo nome. */
  @IsOptional()
  @IsInt()
  DEPCodigo?: number;
}

export class DepartamentoNomeDto {
  @IsString()
  @MaxLength(60)
  nome: string;
}

export class RegraDepartamentoDto {
  @IsInt()
  HORCodigo: number;

  /** Áreas cuja ENTRADA esta regra libera. Vazio = a regra não libera sentido nenhum. */
  @IsArray()
  @IsInt({ each: true })
  ARECodigos: number[];
}

export class RegrasDepartamentoDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RegraDepartamentoDto)
  regras: RegraDepartamentoDto[];
}

export class DepartamentoAdotarDto {
  /** id de `groups` no equipamento — a adoção vincula por id, não por nome. */
  @IsString()
  @MaxLength(40)
  DEQIdDevice: string;

  /** Reaproveita um departamento da instituição. Sem ele, casa pelo nome ou cria um novo. */
  @IsOptional()
  @IsInt()
  DEPCodigo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  DEPNome?: string;
}
