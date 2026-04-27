export enum HardwareBrand {
  CONTROLID = 'ControlID',
  HIKVISION = 'Hikvision',
  TOPDATA = 'TopData',
  INTELBRAS = 'Intelbras',
}

export interface HardwareUser {
  id: number;
  name: string;
  password?: string;
  cpf?: string;
  limiar?: number;
  tags?: string[];
  faces?: string[];
  faceExtension?: string;
  fingers?: string[];
}
