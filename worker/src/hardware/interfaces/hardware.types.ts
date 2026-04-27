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
