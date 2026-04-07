/**
 * ai-project-rules.ts
 * 
 * Centralizes all project-specific knowledge for the AI assistant.
 * This file is the single source of truth for:
 *   - System prompt rules
 *   - Available tools (function calling) definitions
 *   - Tool execution handlers (schema, snippets, helpers)
 *
 * To evolve AI behavior, edit this file. No other files need to change.
 */

// ─── Schema & Snippets Knowledge Base ───────────────────────────────────────

export interface SchemaField {
    name: string;
    type: string;
    description?: string;
    fk?: string;
    pk?: boolean;
}

export interface SchemaTable {
    name: string;
    alias: string;
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
    }
];

// ─── System Prompt ──────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Você é o assistente de IA embarcado no editor de rotinas de integração do sistema SchoolGuard.

## Seu Papel
Auxiliar desenvolvedores a escrever, corrigir, explicar e sugerir código JavaScript (Node.js/ES6) para rotinas que rodam no engine de execução do SchoolGuard.

## Regras de Código
1. O código é executado diretamente pela VM do SchoolGuard — **NÃO** use \`module.exports\`, \`export default\` ou qualquer wrapper. Escreva o código diretamente (ex: \`const dados = await context.db.PESPessoa.findMany();\`).
2. A palavra reservada de acesso ao contexto é \`context\` — todo acesso a banco, hardware ou request é via \`context.*\`
3. \`axios\` já está disponível globalmente (é feito \`require\` automático pela VM). **NUNCA** use \`import axios\` ou \`const axios = require('axios')\`. Simplesmente use \`axios.get(...)\`, \`axios.post(...)\` diretamente.
4. \`logger\` também é uma variável global pré-injetada. Use \`logger.log()\`, \`logger.info()\`, \`logger.error()\` para gravar logs em arquivo .txt diário.
5. Não use \`import\` ou \`require\` de módulos que não sejam built-in do Node.js. A VM já injeta tudo que é necessário.

## Objetos Disponíveis via \`context\`
- \`context.db\` — Prisma Client isolado por tenant (RLS). Aceita: \`.findMany()\`, \`.findFirst()\`, \`.create()\`, \`.update()\`, \`.delete()\`, \`.groupBy()\`
- \`context.hardware\` — API unificada de controle de equipamentos (catracas, leitores). Métodos: \`syncPerson\`, \`createPerson\`, \`modifyPerson\`, \`deletePerson\`, \`setTag\`, \`removeTag\`, \`setFace\`, \`removeFace\`, \`setFingers\`, \`removeFingers\`, \`setGroups\`, \`removeGroups\`, \`executeAction\`, \`enroll\`, \`customCommand\`
- \`context.adapters\` — Adaptadores legados (equipamentos ativos e suas infos)
- \`context.request\` — Objeto da requisição HTTP (somente em rotinas tipo Webhook). Acesse: \`.body\`, \`.query\`, \`.headers\`, \`.method\`, \`.path\`, \`.params\`

## Quando usar Tools
- Use a tool \`get_database_schema\` quando precisar saber quais **tabelas e campos** estão disponíveis no \`context.db\`
- Use a tool \`get_code_snippets\` quando precisar de **exemplos de código** usando Prisma, Hardware, Webhook, Axios ou Logger
- Se a pergunta do usuário for conceitual ou não envolver código do SchoolGuard, **não chame nenhuma tool**
- Se o pedido do usuário for vago, ambíguo ou faltar definição (ex: "faz uma integração", "sincroniza os dados"), **NÃO assuma** o caminho. Ao invés disso: apresente as possibilidades existentes, explique brevemente os prós/contras de cada abordagem, e **pergunte ao usuário qual caminho seguir** antes de gerar código. Só gere código após confirmação.

## Estilo de Resposta
- Seja conciso e técnico
- Responda sempre em Português-BR
- Quando devolver código, use blocos markdown com \`\`\`javascript
- Não repita a definição dos helpers/contexto ao usuário, apenas use-os naturalmente
`;

// ─── OpenAI Tool Definitions ────────────────────────────────────────────────

export const OPENAI_TOOLS: any[] = [
    {
        type: 'function',
        function: {
            name: 'get_database_schema',
            description: 'Retorna o schema completo do banco de dados disponível via context.db, incluindo nomes de tabelas/modelos, campos e seus tipos. Use quando precisar saber quais tabelas e colunas existem para montar queries Prisma.',
            parameters: {
                type: 'object',
                properties: {
                    table_name: {
                        type: 'string',
                        description: 'Nome opcional de uma tabela específica (ex: PESPessoa). Se vazio, retorna todas.',
                    }
                },
                required: [],
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_code_snippets',
            description: 'Retorna exemplos de código (snippets) prontos para uso no editor de rotinas. Categorias disponíveis: prisma, hardware, webhook, axios, logger, config, files. Use quando precisar de exemplos de como usar os helpers do sistema.',
            parameters: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        enum: ['prisma', 'hardware', 'webhook', 'axios', 'logger', 'config', 'files', 'all'],
                        description: 'Categoria de snippets desejada. Use "all" para retornar tudo.',
                    }
                },
                required: ['category'],
            }
        }
    }
];

// ─── Tool Execution Handlers ────────────────────────────────────────────────

const SNIPPET_CATEGORIES: Record<string, { label: string; code: string }[]> = {
    prisma: [
        { label: 'Where (Operadores)', code: `context.db.PESPessoa.findMany({ where: { PESAtivo: true, PESNome: { contains: 'Silva', mode: 'insensitive' }, PESCodigo: { gt: 100 }, PESGrupo: { in: ['ALUNO','PROFESSOR'] } } })` },
        { label: 'AND/OR', code: `context.db.PESPessoa.findMany({ where: { OR: [{ PESNome: { contains: 'João' } }], AND: [{ PESAtivo: true }] } })` },
        { label: 'OrderBy', code: `context.db.MATMatricula.findMany({ orderBy: [{ MATCurso: 'asc' }, { createdAt: 'desc' }] })` },
        { label: 'Paginação', code: `context.db.REGRegistroPassagem.findMany({ skip: 10, take: 10, orderBy: { REGTimestamp: 'desc' } })` },
        { label: 'Include (Join)', code: `context.db.MATMatricula.findMany({ where: { MATAtivo: true }, include: { pessoa: true } })` },
        { label: 'Select (campos)', code: `context.db.PESPessoa.findMany({ select: { PESNome: true, PESEmail: true } })` },
        { label: 'GroupBy', code: `context.db.PESPessoa.groupBy({ by: ['PESGrupo'], _count: { PESCodigo: true } })` },
    ],
    hardware: [
        { label: 'syncPerson (completo)', code: `await context.hardware.syncPerson(equipId, { id, name, cpf, password, faceExtension, tags: ["tag"], faces: ["base64"], fingers: ["template"] })` },
        { label: 'createPerson', code: `await context.hardware.createPerson(equipId, pessoaId, "Nome", "senha", "cpf", limiar)` },
        { label: 'modifyPerson', code: `await context.hardware.modifyPerson(equipId, pessoaId, "NovoNome", "novaSenha", "cpf", limiar)` },
        { label: 'deletePerson', code: `await context.hardware.deletePerson(pessoaId)` },
        { label: 'setTag / removeTag', code: `await context.hardware.setTag(pessoaId, "tagCode"); await context.hardware.removeTag("tagCode")` },
        { label: 'setFace / removeFace', code: `await context.hardware.setFace(pessoaId, "base64", "jpg"); await context.hardware.removeFace(pessoaId)` },
        { label: 'setFingers / removeFingers', code: `await context.hardware.setFingers(pessoaId, ["t1","t2"]); await context.hardware.removeFingers(pessoaId)` },
        { label: 'setGroups / removeGroups', code: `await context.hardware.setGroups(pessoaId, [1,"TI"]); await context.hardware.removeGroups(pessoaId, [1])` },
        { label: 'executeAction', code: `await context.hardware.executeAction(equipId, "open_door", { door: 1 })` },
        { label: 'enroll', code: `await context.hardware.enroll(equipId, "face", pessoaId)` },
        { label: 'customCommand', code: `await context.hardware.customCommand(equipId, "load_objects", { object: "users", limit: 10 })` },
    ],
    webhook: [
        { label: 'Body', code: `const body = context.request?.body;` },
        { label: 'Query', code: `const id = context.request?.query?.id;` },
        { label: 'Headers', code: `const ct = context.request?.headers?.['content-type'];` },
        { label: 'Method', code: `const method = context.request?.method; // GET, POST, etc.` },
        { label: 'Path/Params', code: `const path = context.request?.path; const params = context.request?.params;` },
    ],
    axios: [
        { label: 'GET simples', code: `const resp = await axios.get('https://api.example.com/data'); console.log(resp.data);` },
        { label: 'Instância com Auth', code: `const api = axios.create({ baseURL: 'https://api.erp.com/v1', headers: { Authorization: 'Bearer TOKEN' } }); const { data } = await api.post('/sync', payload);` },
    ],
    logger: [
        { label: 'log/info/error', code: `logger.log('msg'); logger.info('msg'); logger.error('msg');` },
        { label: 'Try/Catch completo', code: `logger.info('Iniciando...'); try { /* ... */ logger.info('OK'); } catch(e) { logger.error(e.message); }` },
    ],
    config: [
        { label: 'ERP Config', code: `const erp = await context.db.ERPConfiguracao.findFirst(); // erp.ERPUrlBase, erp.ERPToken` },
        { label: 'Instituição', code: `const inst = await context.db.INSInstituicao.findFirst(); // inst.INSNome` },
    ],
    files: [
        { label: 'Baixar imagem Base64', code: `const resp = await axios.get(url, { responseType: 'arraybuffer' }); const b64 = Buffer.from(resp.data,'binary').toString('base64');` },
    ],
};

export function executeToolCall(toolName: string, args: Record<string, any>): string {
    switch (toolName) {
        case 'get_database_schema': {
            const tableName = args.table_name;
            const tables = tableName
                ? ROUTINE_SCHEMA.filter(t => t.name.toLowerCase() === tableName.toLowerCase() || t.alias.toLowerCase() === tableName.toLowerCase())
                : ROUTINE_SCHEMA;

            return JSON.stringify(tables.map(t => ({
                model: t.name,
                alias: t.alias,
                description: t.description,
                fields: t.fields.map(f => ({
                    name: f.name,
                    type: f.type,
                    pk: f.pk || false,
                    fk: f.fk || null,
                    desc: f.description,
                }))
            })));
        }

        case 'get_code_snippets': {
            const cat = args.category || 'all';
            if (cat === 'all') {
                return JSON.stringify(SNIPPET_CATEGORIES);
            }
            const snippets = SNIPPET_CATEGORIES[cat];
            if (!snippets) return JSON.stringify({ error: `Categoria '${cat}' não encontrada. Use: ${Object.keys(SNIPPET_CATEGORIES).join(', ')}` });
            return JSON.stringify(snippets);
        }

        default:
            return JSON.stringify({ error: `Tool '${toolName}' não reconhecida.` });
    }
}
