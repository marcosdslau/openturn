import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { WorkerProcessManager } from './engine/process-manager';
import { startConsumer } from './rotina-consumer';
import { getRedisConnectionOptions } from './redis-connection';

async function bootstrap() {
    const redisOptions = getRedisConnectionOptions();
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error('[Worker] DATABASE_URL is required');
        process.exit(1);
    }

    console.log('[Worker] Starting openturn-worker...');

    const prisma = new PrismaClient();
    await prisma.$connect();
    console.log('[Worker] Database connected');

    const processManager = new WorkerProcessManager(redisOptions);

    const worker = await startConsumer(prisma, processManager, redisOptions);

    const shutdown = async () => {
        console.log('[Worker] Shutting down...');
        await worker.close();
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});
