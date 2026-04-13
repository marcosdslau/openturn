import { Logger } from '@nestjs/common';
import { IHardwareProvider, HardwareUser } from '../interfaces/hardware.types';
import { PrismaService } from '../../common/prisma/prisma.service';

export class HikvisionProvider implements IHardwareProvider {
    private readonly logger = new Logger(HikvisionProvider.name);

    constructor(
        private readonly config: any,
        private readonly prisma: PrismaService,
    ) { }

    async syncPerson(equipmentId: number, person: HardwareUser): Promise<{ idNoEquipamento: string }> {
        this.logger.log(`[Hikvision] Syncing person ${person.id} on equipment ${equipmentId}`);
        // Implementation for Hikvision ISAPI
        return { idNoEquipamento: person.id.toString() };
    }

    async createPerson(equipmentId: number, id: number, name: string, password?: string, cpf?: string, limiar?: number): Promise<void> {
        this.logger.log(`[Hikvision] Creating person ${id} on equipment ${equipmentId} (Pass: ${password ? '***' : 'none'}, CPF: ${cpf}, Threshold: ${limiar})`);
    }

    async modifyPerson(equipmentId: number, id: number, name: string, password?: string, cpf?: string, limiar?: number): Promise<void> {
        this.logger.log(`[Hikvision] Modifying person ${id} on equipment ${equipmentId}`);
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

    async setFace(userId: number, faceBase64: string, extension: string): Promise<void> {
        this.logger.log(`[Hikvision] Setting face for user ${userId} (Ext: ${extension})`);
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

    async setGroups(userId: number, groupIds: (number | string)[]): Promise<void> {
        this.logger.log(`[Hikvision] Setting groups for user ${userId}`);
    }

    async removeGroups(userId: number, groupIds: (number | string)[]): Promise<void> {
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
}
