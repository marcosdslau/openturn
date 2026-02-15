/**
 * Routine Runner - Executa em processo filho
 * 
 * Este script é executado via child_process.fork() e recebe:
 * - code: string com o código JavaScript da rotina
 * - context: objeto com adapters, db, instituicao, etc
 */

const pendingRpcs = new Map<string, { resolve: (value: any) => void, reject: (reason: any) => void }>();

// Escuta mensagens do processo pai
process.on('message', async (message: any) => {
    if (message.type === 'execute') {
        try {
            const { code, context, dbConfig } = message;

            // Cria logger estruturado que envia para o processo pai
            const console = {
                log: (...args: any[]) => sendLog('log', args),
                info: (...args: any[]) => sendLog('info', args),
                warn: (...args: any[]) => sendLog('warn', args),
                error: (...args: any[]) => sendLog('error', args),
            };

            // Setup DB Proxy se houver configuração
            if (dbConfig && dbConfig.models) {
                context.db = createDbProxy(dbConfig.models);
            }

            // Cria função assíncrona com o código da rotina
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const fn = new AsyncFunction('context', 'console', code);

            // Executa a rotina
            const result = await fn(context, console);

            // Envia resultado de sucesso
            process.send?.({
                type: 'success',
                result,
            });

            // Encerra processo (espera um pouco para garantir envio de logs?)
            setTimeout(() => process.exit(0), 100);
        } catch (error: any) {
            // Envia erro
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

/**
 * Cria Proxy de Banco de Dados que encaminha chamadas via RPC
 */
function createDbProxy(models: string[]) {
    const db: any = {};

    for (const modelName of models) {
        // camelCase (ex: PESPessoa -> pessoa) - Presumindo que o config já venha correto ou fazemos aqui?
        // O DbTenantProxy faz: const key = modelName.charAt(0).toLowerCase() + modelName.slice(1);
        // Vamos assumir que a chave no objeto db deve ser igual ao que o usuário espera.
        // O ExecutionService vai mandar models: ['pessoa', 'matricula'] já formatados ou os originais?
        // Melhor mandar os nomes das propriedades que devem existir no objeto db.

        db[modelName] = new Proxy({}, {
            get: (target, prop: string) => {
                return (...args: any[]) => {
                    return sendRpc('db.query', { model: modelName, method: prop, args });
                };
            }
        });
    }

    return db;
}

/**
 * Envia comando RPC e aguarda resposta
 */
function sendRpc(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).substring(7);
        pendingRpcs.set(id, { resolve, reject });

        process.send?.({
            type: 'rpc',
            id,
            method,
            params
        });
    });
}

/**
 * Envia log estruturado para o processo pai
 */
function sendLog(level: string, args: any[]) {
    const message = args.map((arg) => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');

    process.send?.({
        type: 'log',
        level,
        message,
        timestamp: new Date().toISOString(),
    });
}

// Handler para erros não capturados
process.on('uncaughtException', (error) => {
    process.send?.({
        type: 'error',
        error: error.message,
        stack: error.stack,
    });
    setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason: any) => {
    process.send?.({
        type: 'error',
        error: reason?.message || String(reason),
    });
    setTimeout(() => process.exit(1), 100);
});
