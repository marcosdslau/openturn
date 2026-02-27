import fastify from 'fastify';
import { logger } from '../utils/logger';
import { configService } from './config-service';

export class HealthService {
    private server = fastify();

    async start(port = 22100) {
        this.server.get('/health', async () => {
            return {
                status: 'UP',
                version: '1.0.0',
                paired: configService.hasValidAuth(),
            };
        });

        try {
            await this.server.listen({ port, host: '0.0.0.0' });
            logger.info(`Health endpoint listening on http://localhost:${port}/health`);
        } catch (err) {
            logger.error('Failed to start health endpoint', err);
        }
    }

    async stop() {
        await this.server.close();
    }
}

export const healthService = new HealthService();
