import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { HardwareUser } from '../../../interfaces/hardware.types';
import { IHardwareProvider } from '../../../interfaces/hardware-provider.interface';

export abstract class AbstractTopdataProvider implements IHardwareProvider {
  protected readonly logger = new Logger(AbstractTopdataProvider.name);

  constructor(
    protected readonly config: unknown,
    protected readonly prisma: PrismaService,
  ) {}

  async syncPerson(
    equipmentId: number,
    person: HardwareUser,
  ): Promise<{ idNoEquipamento: string }> {
    this.logger.log(
      `[TopData] Syncing person ${person.id} on equipment ${equipmentId}`,
    );
    return { idNoEquipamento: person.id.toString() };
  }

  async createPerson(
    equipmentId: number,
    id: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
  ): Promise<void> {
    this.logger.log(
      `[TopData] Creating person ${id} on equipment ${equipmentId}`,
    );
  }

  async modifyPerson(
    equipmentId: number,
    id: number,
    name: string,
    password?: string,
    cpf?: string,
    limiar?: number,
  ): Promise<void> {
    this.logger.log(
      `[TopData] Modifying person ${id} on equipment ${equipmentId}`,
    );
  }

  async deletePerson(id: number): Promise<void> {
    this.logger.log(`[TopData] Deleting person ${id}`);
  }

  async setTag(userId: number, tag: string): Promise<void> {
    this.logger.log(`[TopData] Setting tag ${tag} for user ${userId}`);
  }

  async removeTag(tag: string): Promise<void> {
    this.logger.log(`[TopData] Removing tag ${tag}`);
  }

  async setFace(
    userId: number,
    faceBase64: string,
    extension: string,
  ): Promise<void> {
    this.logger.log(`[TopData] Setting face for user ${userId}`);
  }

  async removeFace(userId: number): Promise<void> {
    this.logger.log(`[TopData] Removing face for user ${userId}`);
  }

  async setFingers(userId: number, templates: string[]): Promise<void> {
    this.logger.log(`[TopData] Setting fingers for user ${userId}`);
  }

  async removeFingers(userId: number): Promise<void> {
    this.logger.log(`[TopData] Removing fingers for user ${userId}`);
  }

  async setGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    this.logger.log(`[TopData] Setting groups for user ${userId}`);
  }

  async removeGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    this.logger.log(`[TopData] Removing groups for user ${userId}`);
  }

  async executeAction(action: string, params?: any): Promise<void> {
    this.logger.log(`[TopData] Executing action ${action}`);
  }

  async enroll(type: 'face' | 'biometry', userId: number): Promise<void> {
    this.logger.log(`[TopData] Enrolling ${type} for user ${userId}`);
  }

  async customCommand(cmd: string, params?: any): Promise<any> {
    this.logger.log(`[TopData] Custom command ${cmd}`);
  }

  async testConnection(): Promise<{
    ok: boolean;
    deviceId?: string;
    info?: Record<string, unknown>;
    error?: string;
  }> {
    return {
      ok: false,
      error: 'Test Connection ainda não suportado para TopData',
    };
  }
}
