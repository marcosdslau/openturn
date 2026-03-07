
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { HardwareUser, IHardwareProvider, ControlIDConfig } from '../interfaces/hardware.types';
import { PrismaService } from '../../common/prisma/prisma.service';

export class ControlIDProvider implements IHardwareProvider {
    private readonly logger = new Logger(ControlIDProvider.name);
    private readonly client: AxiosInstance;
    private session: string | null = null;

    constructor(
        private readonly config: ControlIDConfig,
        private readonly prisma: PrismaService,
    ) {
        let host = this.config.host;
        let protocol = 'http';

        // Check if host already contains a protocol
        if (host.includes('://')) {
            const parts = host.split('://');
            protocol = parts[0];
            host = parts[1];
        }

        // Check if host already contains a port
        let baseURL = `${protocol}://${host}`;
        if (!host.includes(':')) {
            baseURL += `:${this.config.port || 80}`;
        }

        this.client = axios.create({
            baseURL,
            timeout: 5000,
        });
    }

    private getErrorDetails(error: any): string {
        if (error.message) return error.message;
        if (error.code) return error.code;
        if (error.response?.data?.error_msg) return error.response.data.error_msg;
        return error.message || 'Unknown error';
    }

    private async withRetry<T>(fn: () => Promise<T>, attempts = 5, delay = 2000): Promise<T> {
        let lastError: any;

        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (error: any) {
                lastError = error;
                const message = this.getErrorDetails(error);

                // Check if error is retryable
                const isRetryable =
                    message === 'Invalid session' ||
                    message === 'write ECONNABORTED' ||
                    message === 'read ECONNRESET' ||
                    message === 'socket hang up' ||
                    (error.response?.status === 401 && i < attempts - 1); // 401 is essentially invalid session

                if (isRetryable && i < attempts - 1) {
                    this.logger.warn(`Attempt ${i + 1}/${attempts} failed with '${message}'. Retrying in ${delay}ms...`);

                    if (message === 'Invalid session' || error.response?.status === 401) {
                        this.session = null; // Force re-login
                    }

                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // If not retryable or last attempt, throw
                throw error;
            }
        }
        throw lastError;
    }

    private async login() {
        try {
            const response = await this.client.post('/login.fcgi', {
                login: this.config.user,
                password: this.config.pass,
            });
            this.session = response.data.session;
        } catch (error: any) {
            this.logger.error(`Failed to login to ControlID device at ${this.config.host}`, error.message);
            throw new Error('Device login failed');
        }
    }

    private async ensureSession() {
        if (!this.session) {
            await this.login();
        }
    }

    async syncPerson(equipmentId: number, person: HardwareUser): Promise<{ idNoEquipamento: string }> {
        return this.withRetry(async () => {
            await this.ensureSession();

            // 1. Check if user exists in Hardware (DE-PARA)
            const mapping = await this.prisma.rls.pESEquipamentoMapeamento.findUnique({
                where: { PESCodigo_EQPCodigo: { PESCodigo: person.id, EQPCodigo: equipmentId } }
            });

            const hardwareId = mapping ? parseInt(mapping.PEQIdNoEquipamento, 10) : person.id;

            // 1b. Check if user exists in Hardware Device
            const userResponse = await this.client.post(`/load_objects.fcgi?session=${this.session}`, {
                object: 'users',
                where: { users: { id: hardwareId } }
            });

            const exists = userResponse.data.users && userResponse.data.users.length > 0;

            if (exists) {
                await this.modifyPerson(equipmentId, person.id, person.name, person.password, person.cpf, person.limiar);
            } else {
                await this.createPerson(equipmentId, person.id, person.name, person.password, person.cpf, person.limiar);
            }

            // ... rest of sync logic (tags, biometrics) using resolved hardwareId
            // 2. Sync Tags (Upsert logic)
            if (person.tags) {
                const tagsResponse = await this.client.post(`/load_objects.fcgi?session=${this.session}`, {
                    object: 'cards',
                    where: { cards: { user_id: hardwareId } }
                });

                const currentTags: any[] = tagsResponse.data.cards || [];
                const currentTagValues = currentTags.map(t => t.value.toString());

                for (const tag of person.tags) {
                    if (!currentTagValues.includes(tag)) {
                        await this.setTag(hardwareId, tag);
                    }
                }

                for (const t of currentTags) {
                    if (!person.tags.includes(t.value.toString())) {
                        await this.removeTag(t.value.toString());
                    }
                }
            }

            if (person.faces && person.faces.length > 0) {
                await this.setFace(hardwareId, person.faces[0], person.faceExtension || "jpg");
            }
            if (person.fingers) {
                await this.setFingers(hardwareId, person.fingers);
            }

            return { idNoEquipamento: hardwareId.toString() };
        });
    }

    async modifyPerson(equipmentId: number, id: number, name: string, password?: string, cpf?: string, limiar?: number): Promise<void> {
        await this.ensureSession();

        // 1. Resolve Hardware ID via Mapping (or use person.id as fallback)
        const mapping = await this.prisma.rls.pESEquipamentoMapeamento.findUnique({
            where: { PESCodigo_EQPCodigo: { PESCodigo: id, EQPCodigo: equipmentId } }
        });

        const hardwareId = mapping ? parseInt(mapping.PEQIdNoEquipamento, 10) : id;

        await this.client.post(`/modify_objects.fcgi?session=${this.session}`, {
            object: 'users',
            values: [{
                name,
                registration: hardwareId.toString(),
                password: password || undefined,
                salt: cpf || undefined,
            }],
            where: { users: { id: hardwareId } }
        });
    }

    async createPerson(equipmentId: number, id: number, name: string, password?: string, cpf?: string, limiar?: number): Promise<void> {
        await this.ensureSession();

        const hardwareId = id;
        await this.prisma.rls.pESEquipamentoMapeamento.upsert({
            where: { PESCodigo_EQPCodigo: { PESCodigo: id, EQPCodigo: equipmentId } },
            update: { PEQIdNoEquipamento: hardwareId.toString() },
            create: { PESCodigo: id, EQPCodigo: equipmentId, PEQIdNoEquipamento: hardwareId.toString() }
        });

        await this.client.post(`/create_objects.fcgi?session=${this.session}`, {
            object: 'users',
            values: [{
                id: hardwareId,
                name,
                registration: hardwareId.toString(),
                password: password || undefined,
                salt: cpf || undefined,
            }],
        });
    }

    async setTag(userId: number, tag: string): Promise<void> {
        await this.ensureSession();
        const val = parseInt(tag, 10);
        await this.client.post(`/create_objects.fcgi?session=${this.session}`, {
            object: 'cards',
            values: [{ value: val, user_id: userId }],
        });
    }

    async removeTag(tag: string): Promise<void> {
        await this.ensureSession();
        const val = parseInt(tag, 10);
        await this.client.post(`/destroy_objects.fcgi?session=${this.session}`, {
            object: 'cards',
            where: { cards: { value: val } },
        });
    }

    async setFace(userId: number, faceBase64: string, extension: string): Promise<void> {
        await this.ensureSession();

        // Converte base64 para Buffer (binário)
        const buffer = Buffer.from(faceBase64, 'base64');
        const timestamp = Math.floor(Date.now() / 1000);

        // ControlID usa user_set_image.fcgi para upload binário direto
        // O match=1 indica que deve ser usado para reconhecimento facial
        await this.client.post(
            `/user_set_image.fcgi?session=${this.session}&user_id=${userId}&match=1&timestamp=${timestamp}`,
            buffer,
            {
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            }
        );
    }

    async removeFace(userId: number): Promise<void> {
        await this.ensureSession();
        await this.client.post(`/user_destroy_image.fcgi?session=${this.session}`, {
            user_id: userId
        });
    }

    async setFingers(userId: number, templates: string[]): Promise<void> {
        await this.ensureSession();
        const values = templates.map(template => ({
            user_id: userId,
            template,
            timestamp: Math.floor(Date.now() / 1000)
        }));
        await this.client.post(`/create_objects.fcgi?session=${this.session}`, {
            object: 'templates',
            values
        });
    }

    async removeFingers(userId: number): Promise<void> {
        await this.ensureSession();
        await this.client.post(`/destroy_objects.fcgi?session=${this.session}`, {
            object: 'templates',
            where: { templates: { user_id: userId } }
        });
    }

    async setGroups(userId: number, groupIds: (number | string)[]): Promise<void> {
        await this.ensureSession();
        const values = groupIds.map(gid => ({
            user_id: userId,
            group_id: typeof gid === 'string' ? parseInt(gid, 10) : gid
        }));
        await this.client.post(`/create_objects.fcgi?session=${this.session}`, {
            object: 'user_groups',
            values
        });
    }

    async removeGroups(userId: number, groupIds: (number | string)[]): Promise<void> {
        await this.ensureSession();
        for (const gid of groupIds) {
            const id = typeof gid === 'string' ? parseInt(gid, 10) : gid;
            await this.client.post(`/destroy_objects.fcgi?session=${this.session}`, {
                object: 'user_groups',
                where: { user_groups: { user_id: userId, group_id: id } }
            });
        }
    }


    async deletePerson(id: number): Promise<void> {
        return this.withRetry(async () => {
            await this.ensureSession();
            switch (this.config.model) {
                default:
                    return this.deletePersonInternal(id);
            }
        });
    }

    private async deletePersonInternal(id: number): Promise<void> {
        try {
            await this.client.post(`/destroy_objects.fcgi?session=${this.session}`, {
                object: 'users',
                where: { users: { id: id } }
            });
        } catch (error: any) {
            // Ignore if not found, but log warning if it's another error
            if (error.response?.data?.error_msg !== 'Object not found' &&
                !JSON.stringify(error.response?.data || '').includes('not found')) {
                this.logger.warn(`Failed to delete person ${id}: ${error.message}`);
            }
        }
    }

    async executeAction(action: string, params?: any): Promise<void> {
        return this.withRetry(async () => {
            await this.ensureSession();
            switch (this.config.model) {
                default:
                    return this.executeAction_Standard(action, params);
            }
        });
    }

    private async executeAction_Standard(action: string, params?: any): Promise<void> {
        await this.client.post(`/execute_actions.fcgi?session=${this.session}`, {
            actions: [{ action, parameters: params }]
        });
    }

    async enroll(type: 'face' | 'biometry', userId: number): Promise<void> {
        return this.withRetry(async () => {
            await this.ensureSession();
            switch (this.config.model) {
                default:
                    return this.enroll_Standard(type, userId);
            }
        });
    }

    private async enroll_Standard(type: 'face' | 'biometry', userId: number): Promise<void> {
        await this.client.post(`/remote_enroll.fcgi?session=${this.session}`, {
            type: type,
            save: false,
            user_id: userId,
            sync: false
        });
    }

    async customCommand(cmd: string, params?: any): Promise<any> {
        return this.withRetry(async () => {
            await this.ensureSession();
            switch (this.config.model) {
                default:
                    return this.customCommand_Standard(cmd, params);
            }
        });
    }

    private async customCommand_Standard(cmd: string, params?: any): Promise<any> {
        switch (cmd) {
            case 'load_objects':
                return (await this.client.post(`/load_objects.fcgi?session=${this.session}`, {
                    ...params
                })).data;

            case 'create_objects':
                return (await this.client.post(`/create_objects.fcgi?session=${this.session}`, {
                    ...params
                })).data;

            case 'modify_objects':
                return (await this.client.post(`/modify_objects.fcgi?session=${this.session}`, {
                    ...params
                })).data;

            case 'destroy_objects':
                return (await this.client.post(`/destroy_objects.fcgi?session=${this.session}`, {
                    ...params
                })).data;

            default:
                throw new Error(`Unknown command: ${cmd}`);
        }
    }
}
