import { logger } from '../utils/logger';
import { configService } from '../services/config-service';
import { WssClient } from '../services/ws-client';
import { HttpExecutor } from '../services/http-executor';
import { healthService } from '../services/health-service';

interface StartOptions {
    config?: string;
}

export const start = async (options: StartOptions) => {
    if (options.config) {
        logger.info(`Loading custom config from ${options.config}`);
        // Custom config loading logic could be added here
    }

    if (!configService.hasValidAuth()) {
        logger.error('Connector is not paired. Run "openturn-connector pair" first.');
        process.exit(1);
    }

    logger.info('Starting OpenTurn Addon Connector...');

    let executor: HttpExecutor;

    const client = new WssClient((message) => {
        if (message.type === 'HTTP_REQUEST') {
            executor.execute(message);
        }
    });

    executor = new HttpExecutor(client);

    try {
        await healthService.start();
        client.connect();

        // Keep alive
        process.on('SIGINT', () => {
            logger.info('Shutting down...');
            client.close();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            logger.info('Shutting down...');
            client.close();
            process.exit(0);
        });

    } catch (error) {
        logger.error('Failed to start connector', error);
        process.exit(1);
    }
};
