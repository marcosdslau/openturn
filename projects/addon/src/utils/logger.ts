import pino from 'pino';
import path from 'path';
import fs from 'fs';
import os from 'os';

const logDir = path.join(os.homedir(), '.openturn-connector', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const transport = pino.transport({
    targets: [
        {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
            level: 'info',
        },
        {
            target: 'pino/file',
            options: {
                destination: path.join(logDir, 'connector.log'),
                mkdir: true,
            },
            level: 'debug',
        },
    ],
});

export const logger = pino(
    {
        level: process.env.LOG_LEVEL || 'debug',
    },
    transport
);
