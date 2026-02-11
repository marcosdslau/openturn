import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Iniciando correção das sequências do banco de dados...');

    const tables = [
        { table: 'CLICliente', id: 'CLICodigo' },
        { table: 'INSInstituicao', id: 'INSCodigo' },
        { table: 'PESPessoa', id: 'PESCodigo' },
        { table: 'MATMatricula', id: 'MATCodigo' },
        { table: 'EQPEquipamento', id: 'EQPCodigo' },
        { table: 'ERPConfiguracao', id: 'ERPCodigo' },
        { table: 'USRUsuario', id: 'USRCodigo' },
        { table: 'USRAcesso', id: 'UACCodigo' },
        { table: 'REGRegistroPassagem', id: 'REGCodigo' },
        { table: 'CMDComandoFila', id: 'CMDCodigo' },
    ];

    for (const item of tables) {
        try {
            // Get max ID
            const result = await prisma.$queryRawUnsafe<{ max: number }[]>(
                `SELECT MAX("${item.id}") as max FROM "${item.table}"`
            );

            const maxId = result[0]?.max || 0;

            // Get sequence name
            const seqResult = await prisma.$queryRawUnsafe<{ relname: string }[]>(
                `SELECT pg_get_serial_sequence('"${item.table}"', '${item.id}') as relname`
            );

            const seqName = seqResult[0]?.relname;

            if (seqName) {
                if (maxId > 0) {
                    console.log(`Setting sequence ${seqName} to ${maxId + 1} for table ${item.table}`);
                    await prisma.$executeRawUnsafe(
                        `SELECT setval('${seqName}', ${maxId}, true)`
                    );
                } else {
                    console.log(`Table ${item.table} is empty, resetting sequence ${seqName} to 1`);
                    await prisma.$executeRawUnsafe(
                        `SELECT setval('${seqName}', 1, false)`
                    );
                }
            } else {
                console.warn(`⚠️ Sequência não encontrada para ${item.table}(${item.id})`);
            }
        } catch (error) {
            console.error(`❌ Erro ao processar tabela ${item.table}:`, error.message);
        }
    }

    console.log('\n✅ Sequências sincronizadas com sucesso!');
}

main()
    .catch((e) => {
        console.error('❌ Erro inesperado:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
