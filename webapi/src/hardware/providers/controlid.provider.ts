
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { HardwareUser, IHardwareProvider, ControlIDConfig } from '../interfaces/hardware.types';

export class ControlIDProvider implements IHardwareProvider {
    private readonly logger = new Logger(ControlIDProvider.name);
    private readonly client: AxiosInstance;
    private session: string | null = null;

    constructor(private readonly config: ControlIDConfig) {
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

    async syncPerson(person: HardwareUser): Promise<void> {
        return this.withRetry(async () => {
            await this.ensureSession();

            switch (this.config.model) {
                case 'iDBlock':
                case 'iDBlock Next':
                    // Specific logic for turnstiles if needed
                    return this.syncPerson_Standard(person);
                case 'iDAccess':
                    return this.syncPerson_Standard(person);
                default:
                    return this.syncPerson_Standard(person);
            }
        });
    }

    private async syncPerson_Standard(person: HardwareUser): Promise<void> {
        const session = this.session;

        try {
            // Destroy user first to ensure clean state
            await this.deletePersonInternal(person.id);

            // Create User
            await this.client.post(`/create_objects.fcgi?session=${session}`, {
                object: 'users',
                values: [{
                    id: person.id,
                    name: person.name,
                    registration: person.id.toString(),
                }],
            });

            // Create Cards
            if (person.tags && person.tags.length > 0) {
                const cardValues = person.tags.map(tag => {
                    const val = parseInt(tag, 10);
                    return {
                        value: val,
                        user_id: person.id,
                    };
                });

                await this.client.post(`/create_objects.fcgi?session=${session}`, {
                    object: 'cards',
                    values: cardValues,
                });
            }

            // Sync Faces
            if (person.faces && person.faces.length > 0) {
                await this.client.post(`/user_set_image_list.fcgi?session=${session}`, {
                    user_images: person.faces.map(face => ({
                        user_id: person.id,
                        image: face,
                        timestamp: Math.floor(Date.now() / 1000)
                    }))
                });
            }

            // Sync Templates (Fingerprint)
            if (person.fingers && person.fingers.length > 0) {
                const templates = person.fingers.map(finger => ({
                    user_id: person.id,
                    template: finger,
                    timestamp: Math.floor(Date.now() / 1000)
                }));

                await this.client.post(`/create_objects.fcgi?session=${session}`, {
                    object: 'templates',
                    values: templates
                });
            }

            this.logger.log(`Synced person ${person.id} to ${this.config.host} (${this.config.model || 'Unknown'})`);

        } catch (error: any) {
            this.logger.error(`Error syncing person ${person.id}`, error.response?.data || error.message);
            throw error;
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
                    object: params.object
                })).data;

            case 'create_objects':
                return (await this.client.post(`/create_objects.fcgi?session=${this.session}`, {
                    object: params.object,
                    values: params.values
                })).data;

            case 'modify_objects':
                return (await this.client.post(`/modify_objects.fcgi?session=${this.session}`, {
                    object: params.object,
                    values: params.values,
                    where: params.where
                })).data;

            case 'destroy_objects':
                return (await this.client.post(`/destroy_objects.fcgi?session=${this.session}`, {
                    object: params.object,
                    where: params.where
                })).data;

            default:
                throw new Error(`Unknown command: ${cmd}`);
        }
    }
}
