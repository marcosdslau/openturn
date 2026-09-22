export interface SchemaField {
    name: string;
    type: string;
    description?: string;
    fk?: string; // Reference to another table
    pk?: boolean;
}

export interface SchemaTable {
    name: string; // Internal name (e.g., pESPessoa)
    alias: string; // Friendly name (e.g., Pessoa)
    description: string;
    fields: SchemaField[];
    /** Só leitura em context.db — a engine bloqueia create/update/delete (ex.: tabelas de turma, alteradas via context.turmas). */
    readOnly?: boolean;
    /** Agrupamento no dicionário (ex.: "Controle de acesso por turma"). */
    group?: string;
}

export const ROUTINE_SCHEMA: SchemaTable[] = [
    {
        name: "PESPessoa",
        alias: "Pessoa",
        description: "Cadastro de Pessoas (Alunos, Funcionários, etc)",
        fields: [
            { name: "PESCodigo", type: "Int", pk: true, description: "Identificador único" },
            { name: "PESIdExterno", type: "String", description: "ID Externo (ERP)" },
            { name: "PESNome", type: "String", description: "Nome completo" },
            { name: "PESNomeSocial", type: "String", description: "Nome social" },
            { name: "PESDocumento", type: "String", description: "CPF/CNPJ" },
            { name: "PESEmail", type: "String", description: "Email" },
            { name: "PESTelefone", type: "String", description: "Telefone Fixo" },
            { name: "PESCelular", type: "String", description: "Celular" },
            { name: "PESFotoBase64", type: "String", description: "Foto (Base64)" },
            { name: "PESFotoExtensao", type: "String", description: "Extensão Foto" },
            { name: "PESGrupo", type: "String", description: "Grupo (Aluno, Prof...)" },
            { name: "PESCartaoTag", type: "String", description: "Cartão/Tag Acesso" },
            { name: "PESAtivo", type: "Boolean", description: "Ativo?" },
            { name: "createdAt", type: "DateTime", description: "Data Criação" },
            { name: "updatedAt", type: "DateTime", description: "Data Atualização" },
            { name: "deletedAt", type: "DateTime", description: "Data Exclusão (Soft Delete)" },
            { name: "PESTRMCodigo", type: "Int", fk: "TRMTurma", description: "Turma efetiva p/ controle de acesso (preenchida por context.turmas.vincularPessoas)" },
            { name: "PESGrupoHorario", type: "String", description: "Nome do perfil de horário da turma efetiva (vale só nos equipamentos do escopo)" },
        ]
    },
    {
        name: "MATMatricula",
        alias: "Matricula",
        description: "Vínculos de matrícula da pessoa",
        fields: [
            { name: "MATCodigo", type: "Int", pk: true, description: "ID Matrícula" },
            { name: "PESCodigo", type: "Int", fk: "PESPessoa", description: "ID Pessoa" },
            { name: "MATNumero", type: "String", description: "Número Matrícula (RA)" },
            { name: "MATCurso", type: "String", description: "Curso" },
            { name: "MATSerie", type: "String", description: "Série/Período" },
            { name: "MATTurma", type: "String", description: "Turma" },
            { name: "MATAtivo", type: "Boolean", description: "Ativa?" },
            { name: "createdAt", type: "DateTime", description: "Data Criação" },
            { name: "TRMCodigo", type: "Int", fk: "TRMTurma", description: "Turma do catálogo (vinculada por idEnrollment = MATNumero)" },
        ]
    },
    {
        name: "REGRegistroPassagem",
        alias: "RegistroPassagem",
        description: "Logs de acesso nas catracas",
        fields: [
            { name: "REGCodigo", type: "Int", pk: true, description: "ID Registro" },
            { name: "PESCodigo", type: "Int", fk: "PESPessoa", description: "ID Pessoa" },
            { name: "EQPCodigo", type: "Int", fk: "EQPEquipamento", description: "ID Equipamento" },
            { name: "REGAcao", type: "Enum", description: "ENTRADA | SAIDA" },
            { name: "REGTimestamp", type: "BigInt", description: "Unix Timestamp" },
            { name: "REGDataHora", type: "DateTime", description: "Data/Hora legível" },
            { name: "REGProcessado", type: "Boolean", description: "Já agregado em RegistroDiario" },
            { name: "createdAt", type: "DateTime", description: "Data Criação Login" },
        ]
    },
    {
        name: "EQPEquipamento",
        alias: "Equipamento",
        description: "Dispositivos de controle de acesso",
        fields: [
            { name: "EQPCodigo", type: "Int", pk: true, description: "ID Equipamento" },
            { name: "EQPDescricao", type: "String", description: "Descrição/Local" },
            { name: "EQPMarca", type: "String", description: "Marca (ControlId...)" },
            { name: "EQPModelo", type: "String", description: "Modelo" },
            { name: "EQPEnderecoIp", type: "String", description: "IP" },
            { name: "EQPAtivo", type: "Boolean", description: "Ativo?" },
            { name: "EQPDataUltimaBusca", type: "BigInt", description: "Unix Timestamp da última busca de dados" },
            { name: "createdAt", type: "DateTime", description: "Data Criação" },
        ]
    },
    {
        name: "ERPConfiguracao",
        alias: "ConfigERP",
        description: "Configurações de integração com ERP Externo",
        fields: [
            { name: "ERPCodigo", type: "Int", pk: true, description: "ID Configuração" },
            { name: "ERPSistema", type: "String", description: "Nome do Sistema (Ex: Totvs)" },
            { name: "ERPUrlBase", type: "String", description: "URL Base da API" },
            { name: "ERPToken", type: "String", description: "Token de Autenticação" },
            { name: "ERPConfigJson", type: "Json", description: "Parâmetros extras (JSON)" },
            { name: "INSInstituicaoCodigo", type: "Int", fk: "INSInstituicao", description: "ID Instituição" },
        ]
    },
    {
        name: "INSInstituicao",
        alias: "Instituicao",
        description: "Dados da Instituição (Unidade) atual",
        fields: [
            { name: "INSCodigo", type: "Int", pk: true, description: "ID Instituição" },
            { name: "INSNome", type: "String", description: "Nome da Unidade" },
            { name: "INSAtivo", type: "Boolean", description: "Ativo?" },
            { name: "INSConfigHardware", type: "Json", description: "Configurações Globais Hardware" },
        ]
    },
    {
        name: "PESEquipamentoMapeamento",
        alias: "MapeamentoControle",
        description: "Mapeamento DE-PARA entre Pessoa e Equipamento",
        fields: [
            { name: "PESCodigo", type: "Int", pk: true, fk: "PESPessoa", description: "ID Pessoa" },
            { name: "EQPCodigo", type: "Int", pk: true, fk: "EQPEquipamento", description: "ID Equipamento" },
            { name: "PEQIdNoEquipamento", type: "String", description: "ID no Hardware (De-Para)" },
            { name: "PEQSyncHash", type: "String", description: "Hash do payload confirmado no equipamento (null = pendente)" },
            { name: "PEQSyncedAt", type: "DateTime", description: "Último sync confirmado (null = reenfileirar)" },
        ]
    },
    {
        name: "RPDRegistrosDiarios",
        alias: "RegistroDiario",
        description: "Registros diários de presença agregados por pessoa e data",
        fields: [
            { name: "RPDCodigo", type: "Int", pk: true, description: "ID Registro Diário" },
            { name: "PESCodigo", type: "Int", fk: "PESPessoa", description: "ID Pessoa" },
            { name: "RPDData", type: "DateTime", description: "Data do registro (sem hora)" },
            { name: "RPDDataEntrada", type: "DateTime", description: "Menor horário entre passagens ENTRADA do dia" },
            { name: "RPDDataSaida", type: "DateTime", description: "Maior horário entre passagens SAIDA do dia" },
            { name: "RPDStatus", type: "Enum", description: "ENVIADO | ERRO | MANUAL | PENDENTE" },
            { name: "RPDResult", type: "Json", description: "Retorno da integração ERP" },
            { name: "createdAt", type: "DateTime", description: "Data Criação" },
            { name: "updatedAt", type: "DateTime", description: "Data Atualização" },
        ]
    },

    // ── Controle de acesso por turma — somente leitura em context.db; alterar via context.turmas ──
    {
        name: "TRMTurma",
        alias: "Turma",
        group: "Controle de acesso por turma",
        readOnly: true,
        description: "Catálogo de turmas lido do ERP (idClass). Configuração de horário e equipamentos da turma.",
        fields: [
            { name: "TRMCodigo", type: "Int", pk: true, description: "ID Turma" },
            { name: "TRMIdExterno", type: "String", description: "idClass no ERP (identidade da turma)" },
            { name: "TRMIdOferta", type: "String", description: "idCurriculumOffer de origem" },
            { name: "TRMTurma", type: "String", description: "Nome da turma (name)" },
            { name: "TRMCurso", type: "String", description: "Curso (courseName)" },
            { name: "TRMSerie", type: "String", description: "Série/Módulo (moduleName)" },
            { name: "TRMCurriculo", type: "String", description: "Currículo (curriculumName)" },
            { name: "TRMTurno", type: "String", description: "Turno (shiftName: matutino, vespertino...)" },
            { name: "TRMAnoReferencia", type: "String", description: "Ano de referência (referenceYear)" },
            { name: "TRMCalendario", type: "String", description: "Calendário acadêmico" },
            { name: "TRMDataInicio", type: "DateTime", description: "Início da turma (classStartDate)" },
            { name: "TRMDataFim", type: "DateTime", description: "Fim da turma (classEndDate)" },
            { name: "TRMValidacaoAtiva", type: "Boolean", description: "Controle de acesso por turma ativo?" },
            { name: "TRMTodosEquipamentos", type: "Boolean", description: "Vale em todos os equipamentos (inclusive futuros)?" },
            { name: "TRMAtiva", type: "Boolean", description: "Veio na última leitura do ERP?" },
            { name: "TRMPrioridade", type: "Int", description: "Desempate quando a pessoa está em mais de uma turma (maior vence)" },
            { name: "TRMQtdePessoas", type: "Int", description: "Pessoas com matrícula ativa na turma" },
            { name: "USRCodigoAlteracao", type: "Int", description: "Usuário da última alteração (tela)" },
            { name: "ROTCodigoAlteracao", type: "Int", description: "Rotina da última alteração (context.turmas)" },
            { name: "TRMAlteradoEm", type: "DateTime", description: "Data da última alteração" },
        ]
    },
    {
        name: "PHAPerfilHorario",
        alias: "PerfilHorario",
        group: "Controle de acesso por turma",
        readOnly: true,
        description: "Perfil de horário = departamento no equipamento. Turmas com a mesma regra de entrada E de saída compartilham o mesmo perfil.",
        fields: [
            { name: "PHANome", type: "String", description: "Nome do departamento/horário no equipamento (≤ 15 bytes)" },
            { name: "PHAModoInterna", type: "String", description: "Entrada na Área Interna (Externa → Interna): LIVRE | HORARIO | BLOQUEADO" },
            { name: "PHAModoExterna", type: "String", description: "Entrada na Área Externa (Interna → Externa): LIVRE | HORARIO | BLOQUEADO" },
            { name: "PHAHashJanelas", type: "String", description: "Identidade das regras dos dois sentidos (forma canônica, imutável)" },
            { name: "PHAHashConfig", type: "String", description: "Hash do que deve estar no equipamento (nome + regras)" },
            { name: "updatedAt", type: "DateTime", description: "Data Atualização" },
        ]
    },
    {
        name: "PHAJanela",
        alias: "PerfilHorarioJanela",
        group: "Controle de acesso por turma",
        readOnly: true,
        description: "Faixas de horário do perfil por sentido (só existem para o sentido em modo HORARIO)",
        fields: [
            { name: "PHJCodigo", type: "Int", pk: true, description: "ID Faixa" },
            { name: "PHJSentido", type: "String", description: "INTERNA (entrada na Área Interna) | EXTERNA (entrada na Área Externa)" },
            { name: "PHJHoraInicio", type: "String", description: "Início HH:mm (horário do equipamento)" },
            { name: "PHJHoraFim", type: "String", description: "Fim HH:mm (menor que o início = cruza a meia-noite)" },
            { name: "PHJDom", type: "Boolean", description: "Domingo" },
            { name: "PHJSeg", type: "Boolean", description: "Segunda" },
            { name: "PHJTer", type: "Boolean", description: "Terça" },
            { name: "PHJQua", type: "Boolean", description: "Quarta" },
            { name: "PHJQui", type: "Boolean", description: "Quinta" },
            { name: "PHJSex", type: "Boolean", description: "Sexta" },
            { name: "PHJSab", type: "Boolean", description: "Sábado" },
            { name: "PHJOrdem", type: "Int", description: "Ordem de exibição" },
        ]
    },
    {
        name: "TEQTurmaEquipamento",
        alias: "TurmaEquipamento",
        group: "Controle de acesso por turma",
        readOnly: true,
        description: "Equipamentos selecionados para a turma (usado quando TRMTodosEquipamentos = false)",
        fields: [
            { name: "TEQCodigo", type: "Int", pk: true, description: "ID" },
            { name: "TRMCodigo", type: "Int", fk: "TRMTurma", description: "ID Turma" },
            { name: "EQPCodigo", type: "Int", fk: "EQPEquipamento", description: "ID Equipamento" },
        ]
    },
    {
        name: "PHEPerfilEquipamento",
        alias: "PerfilEquipamento",
        group: "Controle de acesso por turma",
        readOnly: true,
        description: "Estado de sincronização de um perfil em um equipamento",
        fields: [
            { name: "PHECodigo", type: "Int", pk: true, description: "ID" },
            { name: "EQPCodigo", type: "Int", fk: "EQPEquipamento", description: "ID Equipamento" },
            { name: "PHEIdGrupo", type: "String", description: "group_id no equipamento" },
            { name: "PHEIdRegraInterna", type: "String", description: "access_rule_id da entrada na Área Interna (null = bloqueado)" },
            { name: "PHEIdHorarioInterna", type: "String", description: "time_zone_id da entrada na Área Interna" },
            { name: "PHEIdRegraExterna", type: "String", description: "access_rule_id da entrada na Área Externa (null = bloqueado)" },
            { name: "PHEIdHorarioExterna", type: "String", description: "time_zone_id da entrada na Área Externa" },
            { name: "PHESyncHash", type: "String", description: "Hash confirmado no equipamento (null = nada aplicado)" },
            { name: "PHESyncedAt", type: "DateTime", description: "Último sync confirmado" },
            { name: "PHEUltimoErro", type: "String", description: "Último erro ou pendência (ex.: aguardando pessoas saírem do grupo)" },
        ]
    },
    {
        name: "EQSEquipamentoSentido",
        alias: "EquipamentoSentido",
        group: "Controle de acesso por turma",
        readOnly: true,
        description: "Área Interna/Externa e portais de cada equipamento. Sem os dois portais o equipamento fica fora das regras de turma.",
        fields: [
            { name: "EQSCodigo", type: "Int", pk: true, description: "ID" },
            { name: "EQPCodigo", type: "Int", fk: "EQPEquipamento", description: "ID Equipamento (único)" },
            { name: "EQSAreaInternaId", type: "String", description: "area_id da Área Interna no equipamento" },
            { name: "EQSAreaExternaId", type: "String", description: "area_id da Área Externa no equipamento" },
            { name: "EQSPortalInternaId", type: "String", description: "portal_id Externa → Interna (Entrada Área Interna)" },
            { name: "EQSPortalExternaId", type: "String", description: "portal_id Interna → Externa (Entrada Área Externa)" },
            { name: "EQSInvertido", type: "Boolean", description: "Portais trocados após teste em bancada" },
            { name: "EQSCatraConfig", type: "Json", description: "sec_box lido por host: catra_role, catra_side_to_enter, catra_default_fsm" },
            { name: "EQSDiagnostico", type: "Json", description: "O que a preparação criou/reaproveitou, regras gerais replicadas e alertas" },
            { name: "EQSPreparadoEm", type: "DateTime", description: "Última preparação das áreas" },
            { name: "EQSValidadoEm", type: "DateTime", description: "Sentidos conferidos em bancada (null = pendente)" },
            { name: "USRCodigoValidacao", type: "Int", description: "Usuário que validou" },
            { name: "EQSUltimoErro", type: "String", description: "Última falha ao preparar" },
        ]
    }
];
