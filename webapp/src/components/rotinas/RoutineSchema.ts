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
        name: "pESPessoa",
        alias: "pessoa",
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
        name: "mATMatricula",
        alias: "matricula",
        description: "Vínculos de matrícula da pessoa",
        fields: [
            { name: "MATCodigo", type: "Int", pk: true, description: "ID Matrícula" },
            { name: "PESCodigo", type: "Int", fk: "pESPessoa", description: "ID Pessoa" },
            { name: "MATNumero", type: "String", description: "Número Matrícula (RA)" },
            { name: "MATCurso", type: "String", description: "Curso" },
            { name: "MATSerie", type: "String", description: "Série/Período" },
            { name: "MATTurma", type: "String", description: "Turma" },
            { name: "MATAtivo", type: "Boolean", description: "Ativa?" },
            { name: "createdAt", type: "DateTime", description: "Data Criação" },
        ]
    },
    {
        name: "rEGRegistroPassagem",
        alias: "registroPassagem",
        description: "Logs de acesso nas catracas",
        fields: [
            { name: "REGCodigo", type: "Int", pk: true, description: "ID Registro" },
            { name: "PESCodigo", type: "Int", fk: "pESPessoa", description: "ID Pessoa" },
            { name: "EQPCodigo", type: "Int", fk: "eQPEquipamento", description: "ID Equipamento" },
            { name: "REGAcao", type: "Enum", description: "ENTRADA | SAIDA" },
            { name: "REGTimestamp", type: "BigInt", description: "Unix Timestamp" },
            { name: "REGDataHora", type: "DateTime", description: "Data/Hora legível" },
            { name: "createdAt", type: "DateTime", description: "Data Criação Login" },
        ]
    },
    {
        name: "eQPEquipamento",
        alias: "equipamento",
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
    }
];
