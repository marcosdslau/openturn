// Busca a configuração do ERP da instituição
const erp = await context.db.ERPConfiguracao.findFirst();

if (erp) {
    //console.log(`Integrado com: ${erp.ERPSistema}`);
    //console.log(`URL Base: ${erp.ERPUrlBase}`);
    
    if (erp.ERPSistema == 'Gennera') {
        // Cria uma instância reutilizável para o ERP
        const api = axios.create({
            baseURL: erp.ERPUrlBase,
            timeout: 60000,
            headers: {
                'x-access-token': `${erp.ERPToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        const queueAPIMatricula = axios.create({
            baseURL: 'https://staging.schoolguard.com.br/api/instituicoes/101/webhooks',
            timeout: 60000,
            headers: {
            'x-webhook-token': '83c544e5-dc20-4a7a-af3e-250c36f9bb79',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
            }
        });

        // Faz a requisição usando a instância
        try {
            const { data } = await api.get(`/persons`);
            let pessoas = data.filter(p => p.profiles.some(profile => profile.idProfile !== 1 && profile.idProfile !== 4));

            const pessoasIntegradas = await context.db.PESPessoa.findMany({
                where: {
                    PESGrupo: { not: { in: ['Professor', 'Funcionário'] } },
                },
                orderBy: { PESNome: 'asc' }
            });
            console.log(`Encontradas ${pessoasIntegradas.length} pessoas`);

            let count = 1;
            let pessoasInativar = [];
            pessoasIntegradas.forEach(p => {
               let founded = pessoas.find(pes => pes.idPerson == p.PESIdExterno);
               if(!founded) pessoasInativar.push(p.PESCodigo);
            });


            // Cálculo do ano atual para a requisição
            const currentYear = new Date().getFullYear();
            const startDate = `${currentYear}-01-01T03:00:00.000Z`;

            // Fazer as chamadas API em paralelo
            console.info('Fazer as chamadas API em paralelo')
            const [calendariosResponse, ofertasResponse] = await Promise.all([
                api.get(`/academicCalendars?status=active&startDateAfter=${startDate}`),
                api.get(`/curriculumOffers`)
            ]);

            const calendarios = calendariosResponse.data; // Retorna array de calendários
            const ofertas = ofertasResponse.data; // Retorna array de ofertas

            // Filtra as ofertas para incluir apenas aquelas que possuem o idAcademicCalendar presente na lista de calendários
            console.info('Filtra as ofertas para incluir apenas aquelas que possuem o idAcademicCalendar presente na lista de calendários')
            const ofertasVigentes = ofertas.filter(oferta => 
                calendarios.some(calendario => calendario.idAcademicCalendar === oferta.idAcademicCalendar)
            );

            let allTurmas = [];
            
            // Chamada em cadeia para cada oferta vigente
            count = 1;
            console.info('Chamada em cadeia para cada oferta vigente')
            for (const oferta of ofertasVigentes) {
                console.info(`Buscando Ofertas ${count} de ${ofertasVigentes.length}`);
                count++;
                const turmasResponse = await api.get(`/curriculumOffers/${oferta.idCurriculumOffer}/classes`);
                allTurmas = allTurmas.concat(turmasResponse.data);
            }

            let allMatriculas = [];

            // Chamada para cada turma e armazenamento das matrículas
            count = 1;
            console.info('Chamada para cada turma e armazenamento das matrículas')
            for (const turma of allTurmas) {
                console.info(`Buscando Turmas ${count} de ${allTurmas.length}`);
                count++;
                const matriculasResponse = await api.get(`/classes/${turma.idClass}/students`);
                allMatriculas = allMatriculas.concat(matriculasResponse.data);
            }

            // Remove duplicatas com base em idEnrollment
            console.info('Remove duplicatas com base em idEnrollment')
            const uniqueMatriculas = Array.from(new Map(allMatriculas.map(item => [item.idEnrollment, item])).values());
            //console.log(`Total de matrículas únicas encontradas: ${uniqueMatriculas.length}`);

            // Filtra pessoas que possuem idPerson em uniqueMatriculas e agrupa matrículas
            const matriculasPorPessoa = uniqueMatriculas.reduce((acc, matricula) => {
                const pessoa = pessoas.find(p => p.idPerson === matricula.idPerson);
                if (pessoa) {
                    // Verifica se a pessoa já está no acumulador
                    let pessoaExistente = acc.find(p => p.idPerson === pessoa.idPerson);
                    if (!pessoaExistente) {
                        // Se não existir, cria um novo objeto de pessoa no formato desejado
                        pessoaExistente = { ...pessoa, enrollments: [] };
                        acc.push(pessoaExistente);
                    }
                    // Adiciona a matrícula ao array de matrículas da pessoa
                    pessoaExistente.enrollments.push({
                        idPerson: matricula.idPerson,
                        name: matricula.name,
                        idUser: matricula.idUser,
                        idEnrollment: matricula.idEnrollment,
                        status: matricula.status
                    });
                }
                return acc;
            }, []);

            count = 1;
            // Atualiza ou cria registros de PESPessoa
            for (const pessoa of matriculasPorPessoa) { //.slice(0, 3)
                const { enrollments, telephoneAreaCode, telephoneNumber, mobilePhoneAreaCode, mobilePhoneNumber, socialName, name,
               cpf, email, active, idPerson, photo, profiles } = pessoa;
               console.log(`Integrando Pessoas ${count} de ${matriculasPorPessoa.length}`);
               count++;

                // Verifica se a pessoa já existe no banco de dados
                const pessoaExistente = await context.db.PESPessoa.findFirst({
                  where: {
                     PESIdExterno: `${idPerson}`
                  }
               });

               let grupo = '';
               if(profiles.length){
                  for(let profile of profiles){
                     if(profile.idProfile == 4) {
                        grupo = profile.profile;
                        break;
                     } else if (profile.idProfile == 1){
                        grupo = profile.profile;
                        break;
                     } else{
                        grupo = profile.profile;
                     }
                  }
               }
               let telefone = '';
               let celular = '';
               let foto = '';
               let extFoto = '';
               if(telephoneAreaCode)  telefone = `${telefone}`;
               if(telephoneNumber){
                  telefone += `${telephoneNumber}`
               }
               if(mobilePhoneAreaCode)  celular = `${mobilePhoneAreaCode}`;
               if(mobilePhoneNumber){
                celular += `${mobilePhoneNumber}`
               }

               let pessoaDAO = {
                    PESNome: socialName || name,
                    PESNomeSocial: socialName,
                    PESDocumento: cpf || '',
                    PESEmail: email || '',
                    PESTelefone: telefone || '',
                    PESCelular: celular || '',
                    PESGrupo: grupo,
                    PESAtivo: active
                }
                if(true){
                    if(photo){
                        try {
                            const response = await axios.get(photo, { responseType: 'arraybuffer' });
                            foto = Buffer.from(response.data, 'binary').toString('base64');
                            const contentType = response.headers['content-type'] || 'image/jpeg';
                            
                            extFoto = 'jpg';
                            if (contentType.includes('/')) {
                                extFoto = contentType.split('/')[1];
                            }

                            //console.log('Foto convertida. Extensão:', extFoto);

                        } catch (error) {
                            console.error('Erro ao baixar foto:', error.message);
                        }
                    }
                    pessoaDAO['PESFotoBase64'] = foto;
                    pessoaDAO['PESFotoExtensao'] = extFoto;
                }


                let pessoaRecord = pessoaExistente;
                if (pessoaExistente) {
                    //console.log('Pessoa encontrada:', name);
                    await context.db.PESPessoa.update({
                        where: {
                            PESCodigo: pessoaExistente.PESCodigo
                        },
                        data: pessoaDAO
                    });
                    //console.log('Pessoa atualizada!');


                } else {
                    //console.log('Pessoa não encontrada');
                    pessoaDAO['PESIdExterno'] = `${idPerson}`;
                    const novoPessoa = await context.db.PESPessoa.create({
                        data: pessoaDAO
                    });
                    //console.log('Pessoa criada com ID:', novoPessoa.PESCodigo);
                    pessoaRecord = novoPessoa;
                }
                if (pessoaRecord) {
                    // Atualiza ou cria registros de matriculas
                    let x = 1;
                    for (const matricula of enrollments) {
                        console.log(`Matricula da pessoa ${count}`)
                        try {
                            console.log(`Integrando matriculas ${count}-${x} de ${enrollments.length}`);
                            x++; 
                            let statusMatricula = matricula.status && matricula.status === 'active';
                            const matriculaExistente = await context.db.MATMatricula.findFirst({
                                where: {
                                    PESCodigo: pessoaRecord.PESCodigo,
                                    MATNumero: `${matricula.idEnrollment}`
                                }
                            });
                            //console.log(`Status: ${count}-${x}`+ statusMatricula)
                            //console.log(`matriculaExistente ${count}-${x}`+ JSON.stringify(matriculaExistente))
                            
                            if (!statusMatricula){
                                // Matrícula desativada no Gennera
                              if (matriculaExistente) {
                                // Se existir em MATMatricula, devemos excluir
                                //console.log(`Exec Delete for ${count}-${x}`)
                                await context.db.MATMatricula.delete({
                                    where: {
                                        MATCodigo: matriculaExistente.MATCodigo
                                    }
                                });
                                console.log(`Matrícula desativada excluída: ${matricula.idEnrollment}`);
                              }
                            } else {
                                let body = {
                                    matriculaExistente,
                                    idEnrollment: `${matricula.idEnrollment}`,
                                    pes_codigo: pessoaRecord.PESCodigo
                                }
                                console.log('enfileirado queueAPIMatricula');
                                queueAPIMatricula.post('/enrollments', body);
                            }
  

                        } catch (error) {
                            console.error('Erro ao integrar matricula:', error.message);
                        }
                    }

                }

            }

            console.info(`Total de alunos que serão desativados ${pessoasInativar.length}`)
            for(let pes_codigo of pessoasInativar){
                console.log(pes_codigo)
                await context.db.PESPessoa.update({
                    where: {
                        PESCodigo: pes_codigo
                    },
                    data: {
                        PESAtivo: false
                    }
                });

                const listaMatricula = await context.db.MATMatricula.findMany({
                    where: {
                        PESCodigo: pes_codigo
                    }
                });
                console.log(`Encontrados ${listaMatricula.length} registros de Matricula`);
                for(let matricula of listaMatricula){
                    await context.db.MATMatricula.delete({
                        where: {
                            MATCodigo: matricula.MATCodigo
                        }
                    });
                }
                console.log('Matricula atualizada!');
            }


        } catch (error) {
            console.error('Falha na integração:', error.message);
        }
    }
} else {
    console.warn('Nenhuma configuração de ERP encontrada.');
}
