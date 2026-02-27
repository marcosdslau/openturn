import { logger } from '../utils/logger';
import { configService } from '../services/config-service';

export const status = async () => {
    const config = configService.load();

    console.log('\n--- OpenTurn Connector Status ---');
    console.log(`Relay URL: ${config.relayUrl}`);
    console.log(`Paired:    ${config.token ? 'YES' : 'NO'}`);

    if (config.token) {
        console.log(`Token:     ${config.token.substring(0, 10)}...${config.token.substring(config.token.length - 10)}`);
    }

    console.log('--------------------------------\n');
};
