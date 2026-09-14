export enum HardwareBrand {
  CONTROLID = 'ControlID',
  HIKVISION = 'Hikvision',
  TOPDATA = 'TopData',
  INTELBRAS = 'Intelbras',
}

/** Tipos aceitos para aplicar configuração no equipamento (por marca). */
export enum HardwareEquipmentConfigType {
  GERAL = 'GERAL',
  BOX = 'BOX',
  WEBHOOK = 'WEBHOOK',
}

export interface HardwareUser {
  /** Código PESPessoa (chave de `PESEquipamentoMapeamento` com o equipamento). */
  pescodigo: number;
  /**
   * Id do usuário no equipamento (ex.: PESIdExterno numérico, user id no Control iD).
   * Diferente de `pescodigo` quando o cadastro no leitor usa outro identificador.
   */
  id: number;
  name: string;
  password?: string;
  cpf?: string;
  limiar?: number;
  /** Departamento / grupo (PESPessoa.PESGrupo) — casado com `groups` do equipamento Control iD pelo nome ou id. */
  grupo?: string;
  tags?: string[];
  faces?: string[];
  faceExtension?: string;
  fingers?: string[];
}

/**
 * Resultado da gravação do departamento no equipamento. `aplicado: false` quando o grupo
 * solicitado não existe no equipamento (o vínculo anterior é preservado) ou a gravação falhou —
 * nesse caso quem sincroniza NÃO deve carimbar o hash da pessoa como sincronizado.
 */
export interface GrupoAplicado {
  solicitado: string | null;
  aplicado: boolean;
  motivo?: 'nao_encontrado' | 'erro';
}

/** Sentido de giro como entrada em uma área: interna = entrar na escola; externa = sair da escola. */
export type HardwareSentido = 'interna' | 'externa';

/** Regra de um sentido já canonizada: dias (7 posições dom..sab, minutos) só em modo 'horario'. */
export interface RegraSentidoHardware {
  modo: 'livre' | 'horario' | 'bloqueado';
  dias: Array<Array<[number, number]>> | null;
}

/** Departamento + regra por sentido (working/Controle-turma/SpecControlId.md). */
export interface HardwareAccessGroup {
  /** Identificador estável do perfil — compõe nomes únicos de horários no equipamento. */
  codigo: string;
  nome: string;
  interna: RegraSentidoHardware;
  externa: RegraSentidoHardware;
}

export interface HardwareRuleRef {
  accessRuleId?: string;
  timeZoneId?: string;
}

/** Ids no equipamento: departamento e, por sentido, regra de acesso + horário. */
export interface HardwareAccessGroupRef {
  groupId?: string;
  interna?: HardwareRuleRef;
  externa?: HardwareRuleRef;
}

/** Portal (id no equipamento) de cada sentido. */
export type HardwareDirectionPortals = Record<HardwareSentido, string>;

export interface HostCatraConfig {
  host: string;
  catra_role?: string | null;
  catra_side_to_enter?: string | null;
  catra_default_fsm?: string | null;
  erro?: string;
}

export interface HardwareArea {
  id: string;
  nome: string;
}

export interface HardwarePortal {
  id: string;
  nome: string;
  areaFromId: string | null;
  areaToId: string | null;
}

export interface HardwareDirectionSetup {
  areaInternaId: string;
  areaExternaId: string;
  portalInternaId: string;
  portalExternaId: string;
  criados: { areas: number; portais: number };
  portaisPreexistentes: HardwarePortal[];
  regrasReplicadas: number;
  catra: HostCatraConfig[];
}

export interface HardwareDirectionReading {
  catra: HostCatraConfig[];
  areas: HardwareArea[];
  portais: HardwarePortal[];
}

export interface HardwareAccessGroupInspection {
  encontrado: boolean;
  grupo: { id: string; nome: string } | null;
  membros: number;
  areas: HardwareArea[];
  portais: HardwarePortal[];
  regras: Array<{
    id: string;
    nome: string;
    tipo: number;
    portais: string[];
    horarios: Array<{ id: string; nome: string; spans: Array<{ start: number; end: number; dias: number[]; feriados: number[] }> }>;
  }>;
}
