import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';

export interface ConnectorConfig {
    tenantId?: number;
    relayUrl: string;
    token?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.openturn-connector');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export class ConfigService {
    private config: ConnectorConfig | null = null;

    constructor() {
        this.ensureDir();
    }

    private ensureDir() {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
    }

    load(): ConnectorConfig {
        if (this.config) return this.config;

        if (fs.existsSync(CONFIG_FILE)) {
            try {
                const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
                this.config = JSON.parse(data);
                return this.config!;
            } catch (error) {
                logger.error('Failed to parse config file', error);
            }
        }

        return {
            relayUrl: process.env.RELAY_URL || 'ws://localhost:8001/ws/connectors',
        };
    }

    save(config: Partial<ConnectorConfig>) {
        const current = this.load();
        const updated = { ...current, ...config };
        this.config = updated;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
        logger.info('Configuration saved to ' + CONFIG_FILE);
    }

    hasValidAuth(): boolean {
        const config = this.load();
        return !!(config.token && config.relayUrl);
    }
}

export const configService = new ConfigService();
