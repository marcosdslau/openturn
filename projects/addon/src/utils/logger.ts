import pino from 'pino';
import pretty from 'pino-pretty';
import path from 'path';
import fs from 'fs';
import os from 'os';

const logDir = path.join(os.homedir(), '.openturn-connector', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'connector.log');

const streams = [
    {
        level: 'info' as pino.Level,
        stream: pretty({
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
        }),
    },
    {
        level: 'debug' as pino.Level,
        stream: fs.createWriteStream(logFile, { flags: 'a' }),
    },
];

export const logger = pino(
    {
        level: (process.env.LOG_LEVEL as pino.Level) || 'debug',
    },
    pino.multistream(streams)
);
