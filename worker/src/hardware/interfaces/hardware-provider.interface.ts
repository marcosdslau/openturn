import { EQPEquipamento } from '@prisma/client';
import {
  GrupoAplicado,
  HardwareAccessGroup,
  HardwareAccessGroupInspection,
  HardwareAccessGroupRef,
  HardwareDirectionPortals,
  HardwareDirectionReading,
  HardwareDirectionSetup,
  HardwareUser,
} from './hardware.types';
import { IHardwareEquipmentConfiguration } from './hardware-equipment-config.interface';

export interface IHardwareProvider extends IHardwareEquipmentConfiguration {
  /** `grupo` informa se o departamento foi de fato aplicado (ver GrupoAplicado). */
  syncPerson(
    equipmentId: number,
    person: HardwareUser,
  ): Promise<{ idNoEquipamento: string; grupo?: GrupoAplicado }>;

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

  // ── Grupos de acesso (controle de acesso por turma) ──

  /** false = a marca/modelo não implementa grupos de acesso; os demais métodos lançam. */
  supportsAccessGroups(): boolean;

  /**
   * Cria (ou reconhece) Área Interna, Área Externa e os portais de sentido; replica as regras gerais
   * nos portais novos e lê a configuração da catraca em cada host. Idempotente.
   */
  prepareAccessDirection(device: EQPEquipamento): Promise<HardwareDirectionSetup>;

  /** Lê configuração da catraca, áreas e portais (sem alterar nada). */
  readAccessDirection(device: EQPEquipamento): Promise<HardwareDirectionReading>;

  /**
   * Cria/atualiza departamento e, por sentido, regra de permissão ligada só ao portal daquele sentido
   * + horário. Sentido bloqueado = sem regra. Idempotente; renomeia pelo id quando o nome muda.
   */
  syncAccessGroup(
    equipmentId: number,
    group: HardwareAccessGroup,
    ref: HardwareAccessGroupRef | undefined,
    portals: HardwareDirectionPortals,
  ): Promise<HardwareAccessGroupRef>;

  /** O que está gravado no equipamento para o departamento (regras, portais, horários). */
  inspectAccessGroup(equipmentId: number, ref: HardwareAccessGroupRef, nome: string): Promise<HardwareAccessGroupInspection>;

  /** Remove departamento, regras e horários. Só chamar com o grupo sem membros. */
  removeAccessGroup(equipmentId: number, ref: HardwareAccessGroupRef): Promise<void>;

  /** Quantidade de usuários vinculados ao departamento, consultada no próprio equipamento. */
  countAccessGroupMembers(equipmentId: number, ref: HardwareAccessGroupRef): Promise<number>;

  listAccessGroups(equipmentId: number): Promise<Array<{ id: string; nome: string }>>;

  testConnection(): Promise<{
    ok: boolean;
    deviceId?: string;
    info?: Record<string, unknown>;
    error?: string;
  }>;
}
