import { PrismaClient } from '@prisma/client';

async function check() {
    const prisma = new PrismaClient();
    try {
        const connector = await prisma.cONConnector.findUnique({
            where: { INSInstituicaoCodigo: 2 }
        });
        console.log('Connector found:', JSON.stringify(connector, null, 2));

        const count = await prisma.cONConnector.count();
        console.log('Total connectors:', count);
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
