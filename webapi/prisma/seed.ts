import { PrismaClient, GrupoAcesso } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Iniciando seed...');

    // 1. Cliente
    const cliente = await prisma.cLICliente.upsert({
        where: { CLICodigo: 1 },
        update: {},
        create: {
            CLICodigo: 1,
            CLINome: 'Grupo Educacional Exemplo',
            CLIDocumento: '12.345.678/0001-90',
            CLIAtivo: true,
        },
    });
    console.log(`✅ Cliente: ${cliente.CLINome}`);

    // 2. Instituições
    const inst1 = await prisma.iNSInstituicao.upsert({
        where: { INSCodigo: 1 },
        update: {},
        create: {
            INSCodigo: 1,
            CLICodigo: cliente.CLICodigo,
            INSNome: 'Colégio Alpha',
            INSCodigoExterno: 'ALPHA-001',
            INSAtivo: true,
        },
    });

    const inst2 = await prisma.iNSInstituicao.upsert({
        where: { INSCodigo: 2 },
        update: {},
        create: {
            INSCodigo: 2,
            CLICodigo: cliente.CLICodigo,
            INSNome: 'Colégio Beta',
            INSCodigoExterno: 'BETA-002',
            INSAtivo: true,
        },
    });
    console.log(`✅ Instituições: ${inst1.INSNome}, ${inst2.INSNome}`);

    // 3. Usuários (um por grupo de acesso)
    const senhaHash = await bcrypt.hash('123456', 10);

    const usuarios = [
        { USRCodigo: 1, USRNome: 'Super Root', USREmail: 'root@openturn.com', USRGrupo: GrupoAcesso.SUPER_ROOT, CLICodigo: null, INSCodigo: null },
        { USRCodigo: 2, USRNome: 'Super Admin', USREmail: 'superadmin@openturn.com', USRGrupo: GrupoAcesso.SUPER_ADMIN, CLICodigo: null, INSCodigo: null },
        { USRCodigo: 3, USRNome: 'Admin Cliente', USREmail: 'admin@openturn.com', USRGrupo: GrupoAcesso.ADMIN, CLICodigo: cliente.CLICodigo, INSCodigo: null },
        { USRCodigo: 4, USRNome: 'Gestor Alpha', USREmail: 'gestor@openturn.com', USRGrupo: GrupoAcesso.GESTOR, CLICodigo: cliente.CLICodigo, INSCodigo: inst1.INSCodigo },
        { USRCodigo: 5, USRNome: 'Operador Alpha', USREmail: 'operador@openturn.com', USRGrupo: GrupoAcesso.OPERACAO, CLICodigo: cliente.CLICodigo, INSCodigo: inst1.INSCodigo },
    ];

    for (const u of usuarios) {
        await prisma.uSRUsuario.upsert({
            where: { USRCodigo: u.USRCodigo },
            update: {},
            create: { ...u, USRSenha: senhaHash },
        });
    }
    console.log(`✅ Usuários: ${usuarios.length} criados (senha: 123456)`);

    // 4. Pessoas
    const pessoas = [
        { PESNome: 'João Silva', PESDocumento: '111.222.333-44', PESGrupo: 'Aluno', PESEmail: 'joao@email.com', INSInstituicaoCodigo: inst1.INSCodigo },
        { PESNome: 'Maria Santos', PESDocumento: '555.666.777-88', PESGrupo: 'Aluno', PESEmail: 'maria@email.com', INSInstituicaoCodigo: inst1.INSCodigo },
        { PESNome: 'Carlos Pereira', PESDocumento: '999.000.111-22', PESGrupo: 'Professor', PESEmail: 'carlos@email.com', INSInstituicaoCodigo: inst1.INSCodigo },
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

    // 5. Equipamentos (catracas)
    const equipamentos = [
        { EQPDescricao: 'Catraca Entrada Principal', EQPMarca: 'ControlId', EQPModelo: 'iDBlock', EQPEnderecoIp: '192.168.1.100', INSInstituicaoCodigo: inst1.INSCodigo },
        { EQPDescricao: 'Catraca Saída Principal', EQPMarca: 'ControlId', EQPModelo: 'iDBlock', EQPEnderecoIp: '192.168.1.101', INSInstituicaoCodigo: inst1.INSCodigo },
        { EQPDescricao: 'Catraca Portão Lateral', EQPMarca: 'ControlId', EQPModelo: 'iDNext', EQPEnderecoIp: '192.168.1.200', INSInstituicaoCodigo: inst2.INSCodigo },
    ];

    for (const e of equipamentos) {
        const existing = await prisma.eQPEquipamento.findFirst({ where: { EQPEnderecoIp: e.EQPEnderecoIp } });
        if (!existing) {
            await prisma.eQPEquipamento.create({ data: e });
        }
    }
    console.log(`✅ Equipamentos: ${equipamentos.length} criados`);

    console.log('\n🎉 Seed concluído com sucesso!');
    console.log('\n📋 Credenciais de teste:');
    console.log('   root@openturn.com / 123456 (SUPER_ROOT)');
    console.log('   gestor@openturn.com / 123456 (GESTOR)');
    console.log('   operador@openturn.com / 123456 (OPERACAO)');
}

main()
    .catch((e) => {
        console.error('❌ Erro no seed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
