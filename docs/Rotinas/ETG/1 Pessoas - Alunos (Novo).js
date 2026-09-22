// Busca a configuração do ERP da instituição
const erp = await context.db.ERPConfiguracao.findFirst();

if (!erp) {
    console.warn('Nenhuma configuração de ERP encontrada.');
    return;
}

if (erp.ERPSistema !== 'Gennera') {
    console.warn(`ERP "${erp.ERPSistema}" não suportado por esta rotina.`);
    return;
}

const instituicaoId = context.instituicaoCodigo;
console.log('Instituição:', instituicaoId);

// Instância reutilizável para o ERP Gennera
const api = axios.create({
    baseURL: erp.ERPUrlBase,
    timeout: 60000,
    headers: {
        'x-access-token': `${erp.ERPToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Buscar /persons e /enrollments?status=active em paralelo
    // ─────────────────────────────────────────────────────────────────────────
    console.info('Buscando /persons e /enrollments em paralelo...');
    const [pessoasResponse, matriculasResponse] = await Promise.all([
        api.get('/persons'),
        api.get('/enrollments', { params: { status: 'active' } })
    ]);

    // Filtra perfis excluindo Administrador (1) e Responsável (4)
    const pessoas = pessoasResponse.data.filter(
        p => p.profiles.some(profile => profile.idProfile !== 1 && profile.idProfile !== 4)
    );
    console.log(`Total de pessoas elegíveis em /persons: ${pessoas.length}`);

    // Map de acesso rápido a /persons por idPerson (para enriquecimento no loop)
    const pessoasPorIdPerson = new Map(pessoas.map(p => [p.idPerson, p]));

    // Agrupa matrículas ativas por idPerson em um Map para acesso O(1)
    const matriculasPorIdPerson = new Map();
    for (const enrollment of matriculasResponse.data) {
        if (!matriculasPorIdPerson.has(enrollment.idPerson)) {
            matriculasPorIdPerson.set(enrollment.idPerson, []);
        }
        matriculasPorIdPerson.get(enrollment.idPerson).push(enrollment);
    }
    console.log(`Total de matrículas ativas recebidas: ${matriculasResponse.data.length}`);
    console.log(`Total de alunos com matrícula ativa: ${matriculasPorIdPerson.size}`);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Carregar pessoas locais e calcular pré-inativação
    // ─────────────────────────────────────────────────────────────────────────
    const pessoasLocais = await context.db.PESPessoa.findMany({
        where: {
            PESGrupo: { not: { in: ['Professor', 'Funcionário'] } },
        },
        select: {
            PESCodigo: true,
            PESIdExterno: true,
            PESAtivo: true,
        },
        orderBy: { PESNome: 'asc' }
    });
    console.log(`Encontradas ${pessoasLocais.length} pessoas locais (excluindo Professor/Funcionário)`);

    // Quem está localmente mas não tem matrícula ativa no Gennera → candidato a inativação.
    // Usa matriculasPorIdPerson como fonte de verdade (chaves são números vindos do JSON).
    // Guarda o registro inteiro para não regravar quem já está inativo.
    const pessoasInativar = [];
    pessoasLocais.forEach(p => {
        const idPersonNum = parseInt(p.PESIdExterno, 10);
        if (!matriculasPorIdPerson.has(idPersonNum)) {
            pessoasInativar.push(p);
        }
    });
    console.log(`Pré-inativação: ${pessoasInativar.length} pessoas locais sem matrícula ativa`);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Processar cada idPerson que possui matrícula ativa
    //    Itera a partir do Map de matrículas para garantir que nenhum aluno
    //    com matrícula ativa seja ignorado, mesmo que ausente em /persons.
    // ─────────────────────────────────────────────────────────────────────────
    const idPersonsComMatricula = [...matriculasPorIdPerson.keys()];
    console.log(`Total de idPersons a processar (com matrícula ativa): ${idPersonsComMatricula.length}`);

    /**
     * Baixa e processa a foto. Devolve null quando não deu para obter — nesse caso
     * a foto que já está no banco é preservada, nunca sobrescrita com vazio.
     */
    async function baixarFotoProcessada(url, rotulo) {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            return await utils.prepararFoto(response, {
                extensaoPadrao: 'png',
                resolucaoMinima: '160x160',
                resolucaoMaxima: '1920x1080',
            });
        } catch (error) {
            console.error(`Erro ao baixar foto (${rotulo}):`, error.message);
            return null;
        }
    }

    /** Compara valor do banco com valor do DAO tratando null/'' e Json como equivalentes. */
    function mesmoValor(atual, novo) {
        if (atual === novo) return true;
        if (typeof atual === 'object' || typeof novo === 'object') {
            return JSON.stringify(atual ?? null) === JSON.stringify(novo ?? null);
        }
        return (atual ?? '') === (novo ?? '');
    }

    /** Campos do DAO cujo valor difere do registro atual. */
    function camposAlterados(atual, dao) {
        return Object.keys(dao).filter((campo) => !mesmoValor(atual[campo], dao[campo]));
    }

    const estatisticas = { criadas: 0, atualizadas: 0, semMudanca: 0 };

    let count = 1;
    for (const idPerson of idPersonsComMatricula) {
        const enrollmentsAtivos = matriculasPorIdPerson.get(idPerson);
        // Usa o primeiro enrollment como referência de dados da pessoa (fallback)
        const enrollmentRef = enrollmentsAtivos[0];

        // Tenta enriquecer com dados ricos de /persons; caso contrário usa fallback do enrollment
        const pessoaGennera = pessoasPorIdPerson.get(idPerson);

        const name           = pessoaGennera?.name          ?? enrollmentRef.personName   ?? '';
        const socialName     = pessoaGennera?.socialName    ?? enrollmentRef.socialName   ?? null;
        const cpf            = pessoaGennera?.cpf           ?? enrollmentRef.personCpf    ?? '';
        const email          = pessoaGennera?.email         ?? enrollmentRef.userEmail    ?? '';
        const active         = pessoaGennera?.active        ?? true;
        const photo          = pessoaGennera?.photo         ?? null;
        const profiles       = pessoaGennera?.profiles      ?? [];
        const telephoneAreaCode   = pessoaGennera?.telephoneAreaCode   ?? null;
        const telephoneNumber     = pessoaGennera?.telephoneNumber     ?? null;
        const mobilePhoneAreaCode = pessoaGennera?.mobilePhoneAreaCode ?? null;
        const mobilePhoneNumber   = pessoaGennera?.mobilePhoneNumber   ?? null;

        const origem = pessoaGennera ? '/persons' : 'enrollment (fallback)';
        console.log(`Processando pessoa ${count} de ${idPersonsComMatricula.length} | ${socialName || name} [${origem}]`);
        count++;

        // Determina o grupo a partir dos perfis quando disponíveis
        let grupo = '';
        for (const profile of profiles) {
            grupo = profile.profile;
            break;
        }

        // Monta telefone fixo (DDD + número)
        let telefone = '';
        if (telephoneAreaCode) telefone = `${telephoneAreaCode}`;
        if (telephoneNumber) telefone += `${telephoneNumber}`;

        // Monta celular
        let celular = '';
        if (mobilePhoneAreaCode) celular = `${mobilePhoneAreaCode}`;
        if (mobilePhoneNumber) celular += `${mobilePhoneNumber}`;

        // Monta DAO base da pessoa. Os campos de foto entram só quando há foto nova:
        // sem isso, um download que falha grava vazio por cima de uma foto boa e a
        // pessoa acaba perdendo a face no equipamento.
        const pessoaDAO = {
            PESNome: socialName || name,
            PESNomeSocial: socialName,
            PESDocumento: cpf || '',
            PESEmail: email || '',
            PESTelefone: telefone,
            PESCelular: celular,
            PESGrupo: grupo,
            PESAtivo: active,
        };

        // Download de foto: tenta URL direta, depois fallback por email
        let resultadoFoto = null;
        if (photo) {
            resultadoFoto = await baixarFotoProcessada(photo, 'url direta');
        } else if (email) {
            resultadoFoto = await baixarFotoProcessada(
                `https://apps.gennera.com.br/public/users/photo?username=${email}`,
                'email',
            );
        }

        if (resultadoFoto?.foto) {
            pessoaDAO.PESFotoBase64 = resultadoFoto.foto;
            pessoaDAO.PESFotoExtensao = resultadoFoto.extencao;
            pessoaDAO.PESImageError = null; // foto voltou: limpa erro anterior
        } else if (resultadoFoto?.imageError) {
            pessoaDAO.PESImageError = resultadoFoto.imageError;
        }

        // Upsert de PESPessoa
        const pessoaExistente = await context.db.PESPessoa.findFirst({
            where: { PESIdExterno: `${idPerson}` }
        });

        let pessoaRecord;
        if (pessoaExistente) {
            // Só grava quando algo mudou de fato. updatedAt parado é o que permite
            // à rotina 4 pular quem já está em dia nos equipamentos.
            const alterados = camposAlterados(pessoaExistente, pessoaDAO);

            if (alterados.length) {
                await context.db.PESPessoa.update({
                    where: { PESCodigo: pessoaExistente.PESCodigo },
                    data: pessoaDAO
                });
                estatisticas.atualizadas++;
                console.log(`  Atualizada — campos: ${alterados.join(', ')}`);
            } else {
                estatisticas.semMudanca++;
            }

            pessoaRecord = pessoaExistente;
        } else {
            pessoaDAO.PESIdExterno = `${idPerson}`;
            pessoaRecord = await context.db.PESPessoa.create({ data: pessoaDAO });
            estatisticas.criadas++;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. Processar matrículas ativas desta pessoa (inline, sem webhook)
        // ─────────────────────────────────────────────────────────────────────
        const idsEnrollmentAtivos = new Set(enrollmentsAtivos.map(e => `${e.idEnrollment}`));

        // Matrículas locais desta pessoa — remove as que não estão mais ativas
        const matriculasLocais = await context.db.MATMatricula.findMany({
            where: { PESCodigo: pessoaRecord.PESCodigo }
        });

        for (const matLocal of matriculasLocais) {
            if (!idsEnrollmentAtivos.has(matLocal.MATNumero)) {
                await context.db.MATMatricula.delete({
                    where: { MATCodigo: matLocal.MATCodigo }
                });
                console.log(`Matrícula removida (não está mais ativa): ${matLocal.MATNumero}`);
            }
        }

        // Upsert de cada matrícula ativa
        let mx = 1;
        for (const enrollment of enrollmentsAtivos) {
            console.log(`  Matrícula ${mx} de ${enrollmentsAtivos.length} | idEnrollment: ${enrollment.idEnrollment}`);
            mx++;

            try {
                const matriculaExistente = await context.db.MATMatricula.findFirst({
                    where: {
                        PESCodigo: pessoaRecord.PESCodigo,
                        MATNumero: `${enrollment.idEnrollment}`
                    }
                });

                const matriculaDAO = {
                    MATCurso: enrollment.courseName || '',
                    MATSerie: enrollment.moduleName || '',
                    MATTurma: enrollment.className || '',
                    MATAtivo: true,
                };

                if (matriculaExistente) {
                    await context.db.MATMatricula.update({
                        where: { MATCodigo: matriculaExistente.MATCodigo },
                        data: matriculaDAO
                    });
                } else {
                    await context.db.MATMatricula.create({
                        data: {
                            PESCodigo: pessoaRecord.PESCodigo,
                            MATNumero: `${enrollment.idEnrollment}`,
                            ...matriculaDAO
                        }
                    });
                }
            } catch (error) {
                console.error(`Erro ao processar matrícula ${enrollment.idEnrollment}:`, error.message);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Inativação final: desativar pessoas e limpar matrículas
    // ─────────────────────────────────────────────────────────────────────────
    const aDesativar = pessoasInativar.filter((p) => p.PESAtivo);
    console.info(
        `Alunos sem matrícula ativa: ${pessoasInativar.length} ` +
            `(${aDesativar.length} a desativar, ${pessoasInativar.length - aDesativar.length} já inativos)`,
    );

    // Quem já está inativo não é regravado — evita bater updatedAt toda noite.
    for (const p of aDesativar) {
        await context.db.PESPessoa.update({
            where: { PESCodigo: p.PESCodigo },
            data: { PESAtivo: false }
        });
        console.log(`Pessoa ${p.PESCodigo} desativada.`);
    }

    // Limpeza de matrículas em uma query só, para todos os sem matrícula ativa.
    if (pessoasInativar.length) {
        const matriculasRemovidas = await context.db.MATMatricula.deleteMany({
            where: { PESCodigo: { in: pessoasInativar.map((p) => p.PESCodigo) } },
        });
        console.log(
            `${matriculasRemovidas.count} matrícula(s) removida(s) de alunos sem matrícula ativa.`,
        );
    }

    console.info(
        `Pessoas — criadas: ${estatisticas.criadas}, atualizadas: ${estatisticas.atualizadas}, ` +
            `sem mudança: ${estatisticas.semMudanca}`,
    );
    console.info('Integração de alunos concluída com sucesso.');

} catch (error) {
    console.error('Falha na integração:', error.message);
}
