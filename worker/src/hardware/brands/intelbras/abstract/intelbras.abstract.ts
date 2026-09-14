import { PrismaClient, EQPEquipamento } from '@prisma/client';
import {
  HardwareAccessGroup,
  HardwareAccessGroupInspection,
  HardwareAccessGroupRef,
  HardwareDirectionPortals,
  HardwareDirectionReading,
  HardwareDirectionSetup,
  HardwareEquipmentConfigType,
  HardwareUser,
} from '../../../interfaces/hardware.types';
import { IHardwareProvider } from '../../../interfaces/hardware-provider.interface';
import { badRequest } from '../../../util/bad-request';
import { HardwareLogger } from '../../../util/hardware-logger';

export abstract class AbstractIntelbrasProvider implements IHardwareProvider {
  protected readonly logger = new HardwareLogger('AbstractIntelbras');

  constructor(
    protected readonly config: unknown,
    protected readonly prisma: PrismaClient,
  ) {}

  async syncPerson(
    equipmentId: number,
    person: HardwareUser,
  ): Promise<{ idNoEquipamento: string }> {
    this.logger.log(
      `[Intelbras] Syncing pescodigo=${person.pescodigo} id=${person.id} on equipment ${equipmentId}`,
    );
    return { idNoEquipamento: person.id.toString() };
  }

  async createPerson(
    equipmentId: number,
    pescodigo: number,
    id: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
    _grupo?: string,
  ): Promise<void> {
    this.logger.log(
      `[Intelbras] Creating pescodigo=${pescodigo} id=${id} on equipment ${equipmentId}`,
    );
  }

  async modifyPerson(
    equipmentId: number,
    pescodigo: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
    _grupo?: string,
  ): Promise<void> {
    this.logger.log(
      `[Intelbras] Modifying pescodigo=${pescodigo} on equipment ${equipmentId}`,
    );
  }

  async deletePerson(id: number): Promise<void> {
    this.logger.log(`[Intelbras] Deleting person ${id}`);
  }

  async setTag(userId: number, tag: string): Promise<void> {
    this.logger.log(`[Intelbras] Setting tag ${tag} for user ${userId}`);
  }

  async removeTag(tag: string): Promise<void> {
    this.logger.log(`[Intelbras] Removing tag ${tag}`);
  }

  async setFace(
    userId: number,
    faceBase64: string,
    extension: string,
  ): Promise<void> {
    this.logger.log(`[Intelbras] Setting face for user ${userId}`);
  }

  async removeFace(userId: number): Promise<void> {
    this.logger.log(`[Intelbras] Removing face for user ${userId}`);
  }

  async setFingers(userId: number, templates: string[]): Promise<void> {
    this.logger.log(`[Intelbras] Setting fingers for user ${userId}`);
  }

  async removeFingers(userId: number): Promise<void> {
    this.logger.log(`[Intelbras] Removing fingers for user ${userId}`);
  }

  async setGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    this.logger.log(`[Intelbras] Setting groups for user ${userId}`);
  }

  async removeGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    this.logger.log(`[Intelbras] Removing groups for user ${userId}`);
  }

  async executeAction(action: string, params?: any): Promise<void> {
    this.logger.log(`[Intelbras] Executing action ${action}`);
  }

  async enroll(type: 'face' | 'biometry', userId: number): Promise<void> {
    this.logger.log(`[Intelbras] Enrolling ${type} for user ${userId}`);
  }

  // Grupos de acesso (controle por turma): ainda não implementado para Intelbras.
  supportsAccessGroups(): boolean {
    return false;
  }

  async prepareAccessDirection(_device: EQPEquipamento): Promise<HardwareDirectionSetup> {
    throw new Error('[Intelbras] prepareAccessDirection não implementado');
  }

  async readAccessDirection(_device: EQPEquipamento): Promise<HardwareDirectionReading> {
    throw new Error('[Intelbras] readAccessDirection não implementado');
  }

  async syncAccessGroup(
    _equipmentId: number,
    _group: HardwareAccessGroup,
    _ref: HardwareAccessGroupRef | undefined,
    _portals: HardwareDirectionPortals,
  ): Promise<HardwareAccessGroupRef> {
    throw new Error('[Intelbras] syncAccessGroup não implementado');
  }

  async inspectAccessGroup(
    _equipmentId: number,
    _ref: HardwareAccessGroupRef,
    _nome: string,
  ): Promise<HardwareAccessGroupInspection> {
    throw new Error('[Intelbras] inspectAccessGroup não implementado');
  }

  async removeAccessGroup(_equipmentId: number, _ref: HardwareAccessGroupRef): Promise<void> {
    throw new Error('[Intelbras] removeAccessGroup não implementado');
  }

  async countAccessGroupMembers(_equipmentId: number, _ref: HardwareAccessGroupRef): Promise<number> {
    throw new Error('[Intelbras] countAccessGroupMembers não implementado');
  }

  async listAccessGroups(_equipmentId: number): Promise<Array<{ id: string; nome: string }>> {
    throw new Error('[Intelbras] listAccessGroups não implementado');
  }

  async customCommand(cmd: string, params?: any): Promise<any> {
    this.logger.log(`[Intelbras] Custom command ${cmd}`);
  }

  async applyEquipmentConfiguration(
    _device: EQPEquipamento,
    _type: HardwareEquipmentConfigType,
  ): Promise<unknown> {
    throw badRequest({
      supported: false,
      brand: 'Intelbras',
      message:
        'Configuração por tipo (GERAL/BOX/WEBHOOK) ainda não suportada para esta marca.',
    });
  }

  async testConnection(): Promise<{
    ok: boolean;
    deviceId?: string;
    info?: Record<string, unknown>;
    error?: string;
  }> {
    return {
      ok: false,
      error: 'Test Connection ainda não suportado para Intelbras',
    };
  }
}
