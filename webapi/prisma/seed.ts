import { PrismaClient, GrupoAcesso } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
    console.log('🌱 Iniciando seed...');

    const CLIENTE_CNPJ = '12.345.678/0001-90';

    // 1. Cliente
    let cliente = await prisma.cLICliente.findUnique({
        where: { CLIDocumento: CLIENTE_CNPJ },
    });
    if (!cliente) {
        cliente = await prisma.cLICliente.create({
            data: {
                CLINome: 'Grupo SchoolGuard',
                CLIDocumento: CLIENTE_CNPJ,
                CLIAtivo: true,
            },
        });
    }
    console.log(`✅ Cliente: ${cliente.CLINome}`);

    // 2. Instituições
    let inst1 = await prisma.iNSInstituicao.findFirst({
        where: {
            CLICodigo: cliente.CLICodigo,
            INSCodigoExterno: 'CSG',
            INSNome: 'Colégio SchoolGuard',
        },
    });
    if (!inst1) {
        inst1 = await prisma.iNSInstituicao.create({
            data: {
                CLICodigo: cliente.CLICodigo,
                INSNome: 'Colégio SchoolGuard',
                INSCodigoExterno: 'CSG',
                INSAtivo: true,
            },
        });
    }

    let inst2 = await prisma.iNSInstituicao.findFirst({
        where: {
            CLICodigo: cliente.CLICodigo,
            INSCodigoExterno: 'CSG',
            INSNome: 'Colégio SchoolGuard - Samples',
        },
    });
    if (!inst2) {
        inst2 = await prisma.iNSInstituicao.create({
            data: {
                CLICodigo: cliente.CLICodigo,
                INSNome: 'Colégio SchoolGuard - Samples',
                INSCodigoExterno: 'CSG',
                INSAtivo: true,
            },
        });
    }
    console.log(`✅ Instituições: ${inst1.INSNome}, ${inst2.INSNome}`);

    // 3. Usuário Super Root
    const ROOT_EMAIL = 'marcosdslau@gmail.com';

    let usuarioRoot = await prisma.uSRUsuario.findUnique({
        where: { USREmail: ROOT_EMAIL },
    });
    if (!usuarioRoot) {
        usuarioRoot = await prisma.uSRUsuario.create({
            data: {
                USRNome: 'Marcos Lau',
                USREmail: ROOT_EMAIL,
                USRSenha: '',
            },
        });
        console.log(`✅ Usuário: ${usuarioRoot.USRNome} (${usuarioRoot.USREmail})`);
    } else {
        console.log(`⏭️  Usuário já existe: ${usuarioRoot.USREmail}`);
    }

    // 3.1 Acesso Super Root
    const acessoRoot = await prisma.uSRAcesso.findFirst({
        where: {
            USRCodigo: usuarioRoot.USRCodigo,
            grupo: GrupoAcesso.SUPER_ROOT,
            CLICodigo: null,
            INSInstituicaoCodigo: null,
        },
    });
    if (!acessoRoot) {
        await prisma.uSRAcesso.create({
            data: {
                USRCodigo: usuarioRoot.USRCodigo,
                grupo: GrupoAcesso.SUPER_ROOT,
                CLICodigo: null,
                INSInstituicaoCodigo: null,
            },
        });
        console.log('✅ Acesso: SUPER_ROOT vinculado');
    }

    // 4. Pessoas (instituição Samples)
    const pessoas = [
        { PESNome: 'João Silva', PESDocumento: '111.222.333-44', PESGrupo: 'Aluno', PESEmail: 'joao@email.com', INSInstituicaoCodigo: inst2.INSCodigo },
        { PESNome: 'Maria Santos', PESDocumento: '555.666.777-88', PESGrupo: 'Aluno', PESEmail: 'maria@email.com', INSInstituicaoCodigo: inst2.INSCodigo },
        { PESNome: 'Carlos Pereira', PESDocumento: '999.000.111-22', PESGrupo: 'Professor', PESEmail: 'carlos@email.com', INSInstituicaoCodigo: inst2.INSCodigo },
        { PESNome: 'Ana Oliveira', PESDocumento: '333.444.555-66', PESGrupo: 'Aluno', PESEmail: 'ana@email.com', INSInstituicaoCodigo: inst2.INSCodigo },
        { PESNome: 'Pedro Costa', PESDocumento: '777.888.999-00', PESGrupo: 'Funcionario', PESEmail: 'pedro@email.com', INSInstituicaoCodigo: inst2.INSCodigo },
    ];
    for (const p of pessoas) {
        const existing = await prisma.pESPessoa.findFirst({ where: { PESDocumento: p.PESDocumento } });
        if (!existing) {
            await prisma.pESPessoa.create({
                data: { ...p, PESAtivo: true },
            });
        }
    }
    console.log(`✅ Pessoas: ${pessoas.length} criadas`);

    // 5. AI MVP - Providers & Models
    let providerOpenAI = await prisma.aIPProvedorIa.findFirst({
        where: { AIPNome: 'OpenAI' },
    });
    if (!providerOpenAI) {
        providerOpenAI = await prisma.aIPProvedorIa.create({
            data: {
                AIPNome: 'OpenAI',
                AIPAtivo: true,
            },
        });
    }

    const aiModels = [
        { AIMNome: 'gpt-3.5-turbo', AIMProviderModelId: 'gpt-3.5-turbo', AIMCustoInput1k: 0.0005, AIMCustoOutput1k: 0.0015, AIMMaxTokens: 16384 },
        { AIMNome: 'gpt-4-turbo', AIMProviderModelId: 'gpt-4-turbo', AIMCustoInput1k: 0.01, AIMCustoOutput1k: 0.03, AIMMaxTokens: 128000 },
        { AIMNome: 'gpt-4o-mini', AIMProviderModelId: 'gpt-4o-mini', AIMCustoInput1k: 0.00015, AIMCustoOutput1k: 0.0006, AIMMaxTokens: 128000 },
    ];

    for (const m of aiModels) {
        const existing = await prisma.aIMModeloIa.findFirst({ where: { AIMNome: m.AIMNome } });
        if (!existing) {
            await prisma.aIMModeloIa.create({
                data: { ...m, AIPCodigo: providerOpenAI.AIPCodigo, AIMAtivo: true },
            });
        }
    }
    console.log(`✅ AI: ${aiModels.length} modelos de IA criados`);

    console.log('\n🎉 Seed concluído com sucesso!');
    console.log('\n📋 Acesso inicial:');
    console.log(`   ${ROOT_EMAIL} (SUPER_ROOT) — use "Esqueci minha senha" no primeiro acesso`);
}
main()
    .catch((e) => {
        console.error('❌ Erro no seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
