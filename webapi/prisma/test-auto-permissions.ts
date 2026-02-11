import { PrismaClient, GrupoAcesso } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧪 Iniciando teste de criação de usuário com auto-permisão...');

    const testEmail = `test_${Date.now()}@example.com`;
    const activeScope = {
        clienteId: 1,
        instituicaoId: 1
    };

    // 1. Test New User
    console.log(`\n1. Criando novo usuário: ${testEmail}`);

    const createTest = async (email: string, scope: any) => {
        let usuario = await prisma.uSRUsuario.findUnique({ where: { USREmail: email } });
        if (!usuario) {
            usuario = await prisma.uSRUsuario.create({
                data: {
                    USRNome: 'Test User',
                    USREmail: email,
                    USRSenha: 'hashed_password'
                }
            });
            console.log(`   ✅ Usuário criado: ID ${usuario.USRCodigo}`);
        } else {
            console.log(`   ℹ️ Usuário já existe: ID ${usuario.USRCodigo}`);
        }

        const accessData = {
            USRCodigo: usuario.USRCodigo,
            grupo: GrupoAcesso.OPERACAO,
            CLICodigo: scope.clienteId,
            INSInstituicaoCodigo: scope.instituicaoId,
        };

        const existingAccess = await prisma.uSRAcesso.findFirst({ where: accessData });
        if (!existingAccess) {
            await prisma.uSRAcesso.create({ data: accessData });
            console.log(`   ✅ Permissão OPERACAO adicionada para Inst ${scope.instituicaoId}`);
        } else {
            console.log(`   ℹ️ Permissão OPERACAO já existe para Inst ${scope.instituicaoId}`);
        }

        return usuario;
    };

    await createTest(testEmail, activeScope);

    // 2. Test Existing User (same email)
    console.log(`\n2. Tentando criar o mesmo usuário novamente para outro contexto...`);
    const activeScope2 = { clienteId: 1, instituicaoId: 2 };
    await createTest(testEmail, activeScope2);

    // Verification
    const finalUser = await prisma.uSRUsuario.findUnique({
        where: { USREmail: testEmail },
        include: { acessos: true }
    });

    console.log(`\n📊 Resultado Final para ${testEmail}:`);
    if (!finalUser) {
        console.error('❌ Usuário não encontrado no DB!');
        return;
    }

    console.log(`   Total de acessos: ${finalUser.acessos.length}`);
    finalUser.acessos.forEach(a => {
        console.log(`   - Grupo: ${a.grupo}, Cliente: ${a.CLICodigo}, Inst: ${a.INSInstituicaoCodigo}`);
    });

    if (finalUser.acessos.length === 2) {
        console.log('\n✅ TESTE BEM SUCEDIDO!');
    } else {
        console.log('\n❌ TESTE FALHOU!');
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
