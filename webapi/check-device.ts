import { PrismaClient } from '@prisma/client';

async function check() {
    const prisma = new PrismaClient();
    try {
        const dev = await prisma.eQPEquipamento.findUnique({
            where: { EQPCodigo: 100 }
        });
        console.log('Device 100:', JSON.stringify(dev, null, 2));
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
