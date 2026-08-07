import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { WorkerProcessManager } from './engine/process-manager';
import { startConsumer } from './rotina-consumer';
import { getRedisConnectionOptions } from './redis-connection';
import { workerLogLine } from './worker-log';
import { WsRelayClient } from './hardware/relay/ws-relay-client';
import { HardwareFactory } from './hardware/factory/hardware.factory';
import { getWebApiWsUrl } from './webapi-ws-url';

/**
 * Handlers globais: sem eles, um erro não tratado (ex.: 'error' emitido pela conexão
 * amqplib) derruba o processo Node inteiro (ver `node:events:486 throw er`), o que mata
 * as 3 instâncias PM2/Windows Service de uma vez e depende só do restart automático para
 * voltar. Registrar aqui garante que o processo sobrevive; a reconexão de fato é feita em
 * `RabbitRotinaConsumer` (RabbitMQ) e pelo `retryStrategy` do ioredis (Redis).
 */
function installGlobalErrorHandlers() {
    process.on('unhandledRejection', (reason) => {
        console.error(workerLogLine('Unhandled rejection (processo continua vivo):'), reason);
    });
    process.on('uncaughtException', (error) => {
        console.error(workerLogLine('Uncaught exception (processo continua vivo):'), error);
    });
}

async function bootstrap() {
    installGlobalErrorHandlers();
    const redisOptions = getRedisConnectionOptions();
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error(workerLogLine('DATABASE_URL is required'));
        process.exit(1);
    }

    console.log(workerLogLine('Starting openturn-worker...'));

    const prisma = new PrismaClient();
    await prisma.$connect();
    console.log(workerLogLine('Database connected'));

    const processManager = new WorkerProcessManager(redisOptions);

    const wsUrl = getWebApiWsUrl();
    const relayToken = process.env.RELAY_INTERNAL_TOKEN ?? '';
    let wsRelay: WsRelayClient | null = null;
    if (wsUrl) {
        wsRelay = new WsRelayClient(wsUrl, relayToken);
        wsRelay.start();
        console.log(workerLogLine(`WS relay client configured: ${wsUrl}`));
    } else {
        console.log(
            workerLogLine(
                'WEBAPI_WS_URL / WEBAPI_WS_HOST não definidos — equipamentos com addon (EQPUsaAddon) falharão até configurar o relay.',
            ),
        );
    }

    const hardwareFactory = new HardwareFactory(prisma, wsRelay);

    const worker = await startConsumer(prisma, processManager, redisOptions, hardwareFactory);

    const shutdown = async () => {
        console.log(workerLogLine('Shutting down...'));
        await worker.close();
        wsRelay?.stop();
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
    console.error(workerLogLine('Fatal error:'), err);
    process.exit(1);
});
