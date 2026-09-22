
async function run() {
    // Busca a configuração do ERP da instituição
    const erp = await context.db.ERPConfiguracao.findFirst();
  
    if (!erp) {
      console.warn('Nenhuma configuração de ERP encontrada.');
      return;
    }
  
    console.log(`Integrado com: ${erp.ERPSistema}`);
    console.log(`URL Base: ${erp.ERPUrlBase}`);
  
    if (erp.ERPSistema !== 'Gennera') {
      console.warn(`ERP não suportado neste fluxo: ${erp.ERPSistema}`);
      return;
    }
  
    const instituicaoId = context.instituicaoCodigo;
     console.log('Instituição:', instituicaoId);
  
    // Instância reutilizável para o ERP
    const api = axios.create({
      baseURL: erp.ERPUrlBase,
      timeout: 60000,
      headers: {
        'x-access-token': `${erp.ERPToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  
    // Instância reutilizável para enfileiramento das matrículas
    const queueAPIMatricula = axios.create({
        baseURL: `https://admin.schoolguard.com.br/api/instituicoes/${instituicaoId}/webhooks`,
        timeout: 60000,
        headers: {
              'x-webhook-token': `17eb36d0-d7bd-4eff-893e-b5745ccb3b4b`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
        }
     });
  
    // Limite simples de concorrência sem dependência externa
    async function processWithConcurrency(items, limit, handler) {
      const executing = new Set();
  
      for (const item of items) {
        const p = Promise.resolve().then(() => handler(item));
        executing.add(p);
  
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
  
        if (executing.size >= limit) {
          await Promise.race(executing);
        }
      }
  
      await Promise.all(executing);
    }
  
    function getGrupo(profiles) {
      if (!Array.isArray(profiles) || !profiles.length) return '';
  
      for (const profile of profiles) {
        if (profile.idProfile === 4) return profile.profile;
      }
  
      for (const profile of profiles) {
        if (profile.idProfile === 1) return profile.profile;
      }
  
      return '';
    }
  
    function montarTelefone(areaCode, number) {
      let valor = '';
      if (areaCode) valor += `${areaCode}`;
      if (number) valor += `${number}`;
      return valor;
    }
  
    async function baixarFotoBase64(photoUrl) {
      if (!photoUrl) {
        return {
          foto: '',
          extFoto: ''
        };
      }
  
      try {
        const response = await axios.get(photoUrl, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
  
        const foto = Buffer.from(response.data, 'binary').toString('base64');
        const contentType = response.headers['content-type'] || 'image/jpeg';
  
        let extFoto = 'jpg';
        if (contentType.includes('/')) {
          extFoto = contentType.split('/')[1];
        }
  
        console.log('Foto convertida. Extensão:', extFoto);
  
        return { foto, extFoto };
      } catch (error) {
        console.error('Erro ao baixar foto:', error.message);
        return {
          foto: '',
          extFoto: ''
        };
      }
    }
  
    function pessoaDadosMudou(pessoaBanco, pessoaNova) {
      if (!pessoaBanco) return true;
  
      return (
        (pessoaBanco.PESNome || '') !== (pessoaNova.PESNome || '') ||
        (pessoaBanco.PESNomeSocial || '') !== (pessoaNova.PESNomeSocial || '') ||
        (pessoaBanco.PESDocumento || '') !== (pessoaNova.PESDocumento || '') ||
        (pessoaBanco.PESEmail || '') !== (pessoaNova.PESEmail || '') ||
        (pessoaBanco.PESTelefone || '') !== (pessoaNova.PESTelefone || '') ||
        (pessoaBanco.PESCelular || '') !== (pessoaNova.PESCelular || '') ||
        (pessoaBanco.PESGrupo || '') !== (pessoaNova.PESGrupo || '') ||
        Boolean(pessoaBanco.PESAtivo) !== Boolean(pessoaNova.PESAtivo)
      );
    }
  
    function pessoaMudou(pessoaBanco, pessoaNova) {
      if (!pessoaBanco) return true;
  
      return (
        pessoaDadosMudou(pessoaBanco, pessoaNova) ||
        (pessoaBanco.PESFotoBase64 || '') !== (pessoaNova.PESFotoBase64 || '') ||
        (pessoaBanco.PESFotoExtensao || '') !== (pessoaNova.PESFotoExtensao || '')
      );
    }
  
    // Limitação: se o Gennera trocar a imagem na mesma URL sem alterar outros campos,
    // a foto local não será atualizada até que algum dado cadastral mude.
    async function resolverFoto(pessoaExistente, photoUrl, pessoaDAOBase, fotoMetrics) {
      if (!pessoaExistente) {
        if (photoUrl) {
          fotoMetrics.baixadas++;
          return baixarFotoBase64(photoUrl);
        }
  
        fotoMetrics.ignoradas++;
        return { foto: '', extFoto: '' };
      }
  
      if (!photoUrl) {
        fotoMetrics.ignoradas++;
        return { foto: '', extFoto: '' };
      }
  
      const semFotoLocal = !(pessoaExistente.PESFotoBase64 || '');
      const dadosMudaram = pessoaDadosMudou(pessoaExistente, pessoaDAOBase);
  
      if (semFotoLocal || dadosMudaram) {
        fotoMetrics.baixadas++;
        return baixarFotoBase64(photoUrl);
      }
  
      fotoMetrics.reutilizadas++;
      return {
        foto: pessoaExistente.PESFotoBase64 || '',
        extFoto: pessoaExistente.PESFotoExtensao || ''
      };
    }
  
    async function processarPessoa(person, pessoasIntegradasMap, contador, fotoMetrics) {
      console.info(`Processando ${contador.index} de ${contador.total}`);
      contador.index++;
  
      const {
        telephoneAreaCode,
        telephoneNumber,
        mobilePhoneAreaCode,
        mobilePhoneNumber,
        socialName,
        name,
        cpf,
        email,
        active,
        idPerson,
        photo,
        profiles
      } = person;
  
      const idExterno = String(idPerson);
      const grupo = getGrupo(profiles);
      const telefone = montarTelefone(telephoneAreaCode, telephoneNumber);
      const celular = montarTelefone(mobilePhoneAreaCode, mobilePhoneNumber);
  
      const pessoaExistente = pessoasIntegradasMap.get(idExterno) || null;
  
      const pessoaDAOBase = {
        PESNome: socialName || name || '',
        PESNomeSocial: socialName || '',
        PESDocumento: cpf || '',
        PESEmail: email || '',
        PESTelefone: telefone || '',
        PESCelular: celular || '',
        PESGrupo: grupo,
        PESAtivo: Boolean(active)
      };
  
      const { foto, extFoto } = await resolverFoto(
        pessoaExistente,
        photo,
        pessoaDAOBase,
        fotoMetrics
      );
  
      const pessoaDAO = {
        ...pessoaDAOBase,
        PESFotoBase64: foto,
        PESFotoExtensao: extFoto
      };
  
      let pessoaRecord = pessoaExistente;
  
      if (pessoaExistente) {
        if (pessoaMudou(pessoaExistente, pessoaDAO)) {
          console.log('Pessoa encontrada para atualização:', name);
  
          await context.db.PESPessoa.update({
            where: {
              PESCodigo: pessoaExistente.PESCodigo
            },
            data: pessoaDAO
          });
  
          pessoaRecord = {
            ...pessoaExistente,
            ...pessoaDAO
          };
  
          pessoasIntegradasMap.set(idExterno, pessoaRecord);
          console.log('Pessoa atualizada!');
        } else {
          console.log('Pessoa sem alterações:', name);
        }
      } else {
        console.log('Pessoa não encontrada, criando:', name);
  
        const novoPessoa = await context.db.PESPessoa.create({
          data: {
            ...pessoaDAO,
            PESIdExterno: idExterno
          }
        });
  
        pessoaRecord = novoPessoa;
        pessoasIntegradasMap.set(idExterno, novoPessoa);
  
        console.log('Pessoa criada com ID:', novoPessoa.PESCodigo);
      }
  
      if (!pessoaRecord) return;
  
      try {
        const { data: enrollments } = await api.get(`/persons/${idPerson}/enrollments`);
        console.log('Matriculas da pessoa:', enrollments.length);
  
        // Busca as matrículas locais da pessoa apenas uma vez
        const matriculasLocais = await context.db.MATMatricula.findMany({
          where: {
            PESCodigo: pessoaRecord.PESCodigo
          },
          select: {
            MATCodigo: true,
            MATNumero: true
          }
        });
  
        const matriculasMap = new Map(
          matriculasLocais.map(m => [String(m.MATNumero), m])
        );
  
        // Processa matrículas de forma sequencial por pessoa para preservar estabilidade
        for (const enrollment of enrollments) {
          const enrollmentId = String(enrollment.idEnrollment);
          const statusMatricula = enrollment.status === 'active';
          const matriculaExistente = matriculasMap.get(enrollmentId) || null;
  
          if (!statusMatricula) {
            if (matriculaExistente) {
              await context.db.MATMatricula.delete({
                where: {
                  MATCodigo: matriculaExistente.MATCodigo
                }
              });
  
              console.log(`Matrícula desativada excluída: ${enrollment.idEnrollment}`);
            }
          } else {
            const body = {
              matriculaExistente,
              idEnrollment: enrollmentId,
              pes_codigo: pessoaRecord.PESCodigo
            };
  
            try {
              queueAPIMatricula.post('/enrollments', body);
            } catch (error) {
              console.error(
                `Erro ao enviar matrícula ${enrollmentId} para fila/webhook:`,
                error.message
              );
            }
  
            /*
            // Fluxo direto de matrícula, mantido comentado como no código original
            if (matriculaExistente) {
              await context.db.MATMatricula.update({
                where: {
                  MATCodigo: matriculaExistente.MATCodigo
                },
                data: {
                  MATCurso: enrollment?.courseName || '',
                  MATSerie: enrollment?.moduleName || '',
                  MATTurma: enrollment?.className || '',
                  MATAtivo: true,
                }
              });
              console.log('Matrícula atualizada:', enrollment.idEnrollment);
            } else {
              const novaMatricula = await context.db.MATMatricula.create({
                data: {
                  PESCodigo: pessoaRecord.PESCodigo,
                  MATNumero: enrollmentId,
                  MATCurso: enrollment?.courseName || '',
                  MATSerie: enrollment?.moduleName || '',
                  MATTurma: enrollment?.className || '',
                  MATAtivo: true,
                }
              });
              console.log('Matrícula criada com ID:', novaMatricula.MATCodigo);
            }
            */
          }
        }
      } catch (error) {
        console.error(`Erro ao buscar matriculas da pessoa ${idPerson}:`, error.message);
      }
    }
  
    try {
      const { data } = await api.get('/persons');
  
      // Mantém apenas perfis 1 e 4
      const pessoas = data.filter(
        p => Array.isArray(p.profiles) &&
        p.profiles.some(profile => profile.idProfile === 1 || profile.idProfile === 4)
      );
  
      // Busca pessoas locais uma única vez
      const pessoasIntegradas = await context.db.PESPessoa.findMany({
        where: {
          PESGrupo: { in: ['Professor', 'Funcionário'] }
        },
        select: {
          PESCodigo: true,
          PESIdExterno: true,
          PESNome: true,
          PESNomeSocial: true,
          PESDocumento: true,
          PESEmail: true,
          PESTelefone: true,
          PESCelular: true,
          PESGrupo: true,
          PESAtivo: true,
          PESFotoBase64: true,
          PESFotoExtensao: true
        },
        orderBy: {
          PESNome: 'asc'
        }
      });
  
      console.log(`Encontradas ${pessoasIntegradas.length} pessoas`);
  
      const pessoasIntegradasMap = new Map(
        pessoasIntegradas.map(p => [String(p.PESIdExterno), p])
      );
  
      // Descobre quem deve ser inativado usando Set, evitando O(n²)
      const idsGennera = new Set(pessoas.map(p => String(p.idPerson)));
  
      const pessoasInativar = pessoasIntegradas
        .filter(p => !idsGennera.has(String(p.PESIdExterno)))
        .map(p => p.PESCodigo);
  
      const contador = {
        index: 1,
        total: pessoas.length
      };
  
      const fotoMetrics = {
        baixadas: 0,
        reutilizadas: 0,
        ignoradas: 0
      };
  
      // Concorrência moderada para não estourar ERP / banco / webhook
      await processWithConcurrency(pessoas, 5, async (person) => {
        await processarPessoa(person, pessoasIntegradasMap, contador, fotoMetrics);
      });
  
      console.info(
        `Fotos: ${fotoMetrics.baixadas} baixadas, ${fotoMetrics.reutilizadas} reutilizadas, ${fotoMetrics.ignoradas} ignoradas`
      );
  
      // Pessoas integradas mas que não vieram mais no Gennera serão inativadas
      console.info(`Total de Professores/Colaboradores que serão desativados ${pessoasInativar.length}`);
  
      if (pessoasInativar.length > 0) {
        const deleted = await context.db.MATMatricula.deleteMany({
          where: {
            PESCodigo: {
              in: pessoasInativar
            }
          }
        });
  
        await context.db.PESPessoa.updateMany({
          where: {
            PESCodigo: {
              in: pessoasInativar
            }
          },
          data: {
            PESAtivo: false
          }
        });
  
        console.info(
          `Inativadas ${pessoasInativar.length} pessoas; ${deleted.count} matrículas removidas`
        );
      }
    } catch (error) {
      console.error('Falha na integração:', error.message);
    }
  }
  
  return await run();