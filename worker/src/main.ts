import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { WorkerProcessManager } from './engine/process-manager';
import { startConsumer } from './rotina-consumer';
import { getRedisConnectionOptions } from './redis-connection';
import { workerLogLine } from './worker-log';

async function bootstrap() {
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

    const worker = await startConsumer(prisma, processManager, redisOptions);

    const shutdown = async () => {
        console.log(workerLogLine('Shutting down...'));
        await worker.close();
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
