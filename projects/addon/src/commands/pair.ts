import { Form } from 'enquirer';
import { logger } from '../utils/logger';
import { configService } from '../services/config-service';

export const pair = async () => {
    logger.info('Starting Pairing Wizard...');

    const prompt = new Form({
        name: 'user',
        message: 'Please provide the pairing details from your OpenTurn SaaS:',
        choices: [
            { name: 'relayUrl', message: 'Relay WebSocket URL', initial: 'ws://localhost:8001/ws/connectors' },
            { name: 'token', message: 'Connector Token (JWT)' },
        ]
    });

    try {
        const answers = await prompt.run() as any;

        // Basic validation
        if (!answers.token || !answers.relayUrl) {
            logger.error('Token and Relay URL are required.');
            return;
        }

        configService.save({
            relayUrl: answers.relayUrl,
            token: answers.token,
        });

        logger.info('Pairing successful! You can now run "openturn-connector start".');
    } catch (error) {
        logger.error('Pairing cancelled or failed.');
    }
};
