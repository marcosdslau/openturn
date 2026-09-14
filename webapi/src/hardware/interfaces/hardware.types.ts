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

/** Grupo de acesso (departamento + horário) já canonizado: 7 posições (dom..sab), intervalos em minutos. */
export interface HardwareAccessGroup {
  nome: string;
  dias: Array<Array<[number, number]>>;
}

/** Ids do grupo de acesso no equipamento (Control iD: group_id / access_rule_id / time_zone_id). */
export interface HardwareAccessGroupRef {
  groupId?: string;
  accessRuleId?: string;
  timeZoneId?: string;
}
