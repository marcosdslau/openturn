const body = context.request?.body;
//console.log('Dados recebidos:', body);
const {matriculaExistente, idEnrollment, pes_codigo} = body;

const erp = await context.db.ERPConfiguracao.findFirst();
if (erp) {
    if (erp.ERPSistema == 'Gennera'){
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
        let matricula = null;
        if(idEnrollment){
            const { data } = await api.get(`/enrollments/${idEnrollment}`);
            matricula = data;
        } else {
            console.log(`idEnrollment (${idEnrollment}) inválido, bypass...`)
            return;
        }

        if(matricula == null) throw new Error(`Matricuila idEnrollment (${idEnrollment}) não encontrou resultados`)

        //console.log(JSON.stringify(matricula))
        let statusMatricula = false;
        if(matricula?.status) {
            statusMatricula = matricula.status == "active";
        }

        if (matriculaExistente) {
            // Atualiza os dados da matrícula existente se necessário
            await context.db.MATMatricula.update({
                where: {
                    MATCodigo: matriculaExistente.MATCodigo
                },
                data: {
                    MATCurso: matricula?.courseName || '',
                    MATSerie: matricula?.moduleName || '',
                    MATTurma: matricula?.className || '',
                    MATAtivo: statusMatricula,
                }
            });
        } else {
            // Cria uma nova matrícula
            await context.db.MATMatricula.create({
                data: {
                    PESCodigo: pes_codigo,
                    MATNumero: `${matricula.idEnrollment}`,
                    MATCurso: matricula?.courseName || '',
                    MATSerie: matricula?.moduleName || '',
                    MATTurma: matricula?.className || '',
                    MATAtivo: statusMatricula,
                }
            });
        }
    }
}

return body;
