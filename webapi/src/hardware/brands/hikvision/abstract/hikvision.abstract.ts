import { BadRequestException, Logger } from '@nestjs/common';
import { EQPEquipamento } from '@prisma/client';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import {
  HardwareEquipmentConfigType,
  HardwareUser,
} from '../../../interfaces/hardware.types';
import { IHardwareProvider } from '../../../interfaces/hardware-provider.interface';

export abstract class AbstractHikvisionProvider implements IHardwareProvider {
  protected readonly logger = new Logger(AbstractHikvisionProvider.name);

  constructor(
    protected readonly config: unknown,
    protected readonly prisma: PrismaService,
  ) {}

  async syncPerson(
    equipmentId: number,
    person: HardwareUser,
  ): Promise<{ idNoEquipamento: string }> {
    this.logger.log(
      `[Hikvision] Syncing pescodigo=${person.pescodigo} id=${person.id} on equipment ${equipmentId}`,
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
      `[Hikvision] Creating pescodigo=${pescodigo} id=${id} on equipment ${equipmentId} (Pass: ${password ? '***' : 'none'}, CPF: ${cpf}, Threshold: ${limiar})`,
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
      `[Hikvision] Modifying pescodigo=${pescodigo} on equipment ${equipmentId}`,
    );
  }

  async deletePerson(id: number): Promise<void> {
    this.logger.log(`[Hikvision] Deleting person ${id}`);
  }

  async setTag(userId: number, tag: string): Promise<void> {
    this.logger.log(`[Hikvision] Setting tag ${tag} for user ${userId}`);
  }

  async removeTag(tag: string): Promise<void> {
    this.logger.log(`[Hikvision] Removing tag ${tag}`);
  }

  async setFace(
    userId: number,
    faceBase64: string,
    extension: string,
  ): Promise<void> {
    this.logger.log(
      `[Hikvision] Setting face for user ${userId} (Ext: ${extension})`,
    );
  }

  async removeFace(userId: number): Promise<void> {
    this.logger.log(`[Hikvision] Removing face for user ${userId}`);
  }

  async setFingers(userId: number, templates: string[]): Promise<void> {
    this.logger.log(`[Hikvision] Setting fingers for user ${userId}`);
  }

  async removeFingers(userId: number): Promise<void> {
    this.logger.log(`[Hikvision] Removing fingers for user ${userId}`);
  }

  async setGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    this.logger.log(`[Hikvision] Setting groups for user ${userId}`);
  }

  async removeGroups(
    userId: number,
    groupIds: (number | string)[],
  ): Promise<void> {
    this.logger.log(`[Hikvision] Removing groups for user ${userId}`);
  }

  async executeAction(action: string, params?: any): Promise<void> {
    this.logger.log(`[Hikvision] Executing action ${action}`);
  }

  async enroll(type: 'face' | 'biometry', userId: number): Promise<void> {
    this.logger.log(`[Hikvision] Enrolling ${type} for user ${userId}`);
  }

  async customCommand(cmd: string, params?: any): Promise<any> {
    this.logger.log(`[Hikvision] Custom command ${cmd}`);
  }

  async applyEquipmentConfiguration(
    _device: EQPEquipamento,
    _type: HardwareEquipmentConfigType,
  ): Promise<unknown> {
    throw new BadRequestException({
      supported: false,
      brand: 'Hikvision',
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
      error: 'Test Connection ainda não suportado para Hikvision',
    };
  }
}
