import { HardwareUser } from './hardware.types';
import { IHardwareEquipmentConfiguration } from './hardware-equipment-config.interface';

export interface IHardwareProvider extends IHardwareEquipmentConfiguration {
  syncPerson(
    equipmentId: number,
    person: HardwareUser,
  ): Promise<{ idNoEquipamento: string }>;

  createPerson(
    equipmentId: number,
    pescodigo: number,
    id: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
    grupo?: string,
  ): Promise<void>;
  /** `pescodigo` = PESCodigo; o id no leitor vem do mapeamento. */
  modifyPerson(
    equipmentId: number,
    pescodigo: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
    grupo?: string,
  ): Promise<void>;
  deletePerson(id: number): Promise<void>;

  setTag(userId: number, tag: string): Promise<void>;
  removeTag(tag: string): Promise<void>;

  setFace(userId: number, faceBase64: string, extension: string): Promise<void>;
  removeFace(userId: number): Promise<void>;

  setFingers(userId: number, templates: string[]): Promise<void>;
  removeFingers(userId: number): Promise<void>;

  setGroups(userId: number, groupIds: (number | string)[]): Promise<void>;
  removeGroups(userId: number, groupIds: (number | string)[]): Promise<void>;

  executeAction(action: string, params?: any): Promise<void>;

  enroll(type: 'face' | 'biometry', userId: number): Promise<void>;

  customCommand(cmd: string, params?: any): Promise<any>;

  testConnection(): Promise<{
    ok: boolean;
    deviceId?: string;
    info?: Record<string, unknown>;
    error?: string;
  }>;
}
