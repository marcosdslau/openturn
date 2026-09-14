import {
  GrupoAplicado,
  HardwareAccessGroup,
  HardwareAccessGroupRef,
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
  /** `id` = identificador do usuário no equipamento (ex.: user id no Control iD), não o PESCodigo. */
  deletePerson(id: number): Promise<void>;

  /**
   * Remove todos os usuários cadastrados no equipamento (operação destrutiva).
   * Implementações devem também remover linhas de `PESEquipamentoMapeamento`
   * com `EQPCodigo` igual a `equipmentId` após o hardware ser limpo.
   */
  deleteAllUsers(equipmentId: number): Promise<void>;

  setTag(userId: number, tag: string): Promise<void>;
  removeTag(tag: string): Promise<void>;

  setFace(userId: number, faceBase64: string, extension: string): Promise<void>;
  removeFace(userId: number): Promise<void>;

  setFingers(userId: number, templates: string[]): Promise<void>;
  removeFingers(userId: number): Promise<void>;

  setGroups(userId: number, groupIds: (number | string)[]): Promise<void>;
  removeGroups(userId: number, groupIds: (number | string)[]): Promise<void>;

  executeAction(action: string, params?: any): Promise<void>;

  openGate(equipmentId: number): Promise<void>;

  /** Consulta se o equipamento está em modo de emergência (catraca sempre liberada). */
  getEmergencyMode(equipmentId: number): Promise<{ emergencyMode: boolean }>;

  /** Ativa (`true`) ou desativa (`false`) o modo de emergência do equipamento. */
  setEmergencyMode(equipmentId: number, emergencyMode: boolean): Promise<void>;

  enroll(type: 'face' | 'biometry', userId: number): Promise<void>;

  customCommand(cmd: string, params?: any): Promise<any>;

  // ── Grupos de acesso (controle de acesso por turma) ──

  /** false = a marca/modelo não implementa grupos de acesso; os demais métodos lançam. */
  supportsAccessGroups(): boolean;

  /** Cria/atualiza departamento + regra + horário. Idempotente; renomeia pelo id quando o nome muda. */
  syncAccessGroup(
    equipmentId: number,
    group: HardwareAccessGroup,
    ref?: HardwareAccessGroupRef,
  ): Promise<HardwareAccessGroupRef>;

  /** Remove departamento, regra e horário. Só chamar com o grupo sem membros. */
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
