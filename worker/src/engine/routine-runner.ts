import { FileLogger } from './file-logger';

const pendingRpcs = new Map<string, { resolve: (value: any) => void, reject: (reason: any) => void }>();

process.on('message', async (message: any) => {
    if (message.type === 'execute') {
        try {
            const { code, context, dbConfig } = message;

            const console = {
                log: (...args: any[]) => sendLog('log', args),
                info: (...args: any[]) => sendLog('info', args),
                warn: (...args: any[]) => sendLog('warn', args),
                error: (...args: any[]) => sendLog('error', args),
            };

            if (dbConfig && dbConfig.models) {
                context.db = createDbProxy(dbConfig.models);
            }

            context.hardware = createHardwareProxy();

            const logger = new FileLogger(context.instituicaoCodigo, context.logsDir);
            const axios = require('axios');

            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const fn = new AsyncFunction('context', 'console', 'logger', 'axios', code);

            const result = await fn(context, console, logger, axios);

            process.send?.({ type: 'success', result });
            setTimeout(() => process.exit(0), 100);
        } catch (error: any) {
            process.send?.({
                type: 'error',
                error: error.message || String(error),
                stack: error.stack,
            });
            setTimeout(() => process.exit(1), 100);
        }
    } else if (message.type === 'rpc:success') {
        const pending = pendingRpcs.get(message.id);
        if (pending) {
            pending.resolve(message.result);
            pendingRpcs.delete(message.id);
        }
    } else if (message.type === 'rpc:error') {
        const pending = pendingRpcs.get(message.id);
        if (pending) {
            pending.reject(new Error(message.error));
            pendingRpcs.delete(message.id);
        }
    }
});

function createDbProxy(models: string[]) {
    const db: any = {};
    for (const modelName of models) {
        db[modelName] = new Proxy({}, {
            get: (_target: any, prop: string) => {
                return (...args: any[]) => sendRpc('db.query', { model: modelName, method: prop, args });
            }
        });
    }
    return db;
}

function createHardwareProxy() {
    return new Proxy({}, {
        get: (_target: any, prop: string) => {
            return (equipmentId: number, ...args: any[]) => {
                return sendRpc('hardware.exec', { equipmentId, method: prop, args });
            };
        }
    });
}

function sendRpc(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);
        pendingRpcs.set(id, { resolve, reject });
        process.send?.({ type: 'rpc', id, method, params });
    });
}

function sendLog(level: string, args: any[]) {
    const message = args.map((arg) => {
        if (typeof arg === 'object') {
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
    }).join(' ');

    process.send?.({
        type: 'log', level, message,
        timestamp: new Date().toISOString(),
    });
}

process.on('uncaughtException', (error) => {
    process.send?.({ type: 'error', error: error.message, stack: error.stack });
    setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason: any) => {
    process.send?.({ type: 'error', error: reason?.message || String(reason) });
    setTimeout(() => process.exit(1), 100);
});
