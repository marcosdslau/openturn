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
    }
];
