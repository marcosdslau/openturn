import { ROUTINE_SCHEMA } from './RoutineSchema';

export interface RoutineSnippet {
    label: string;
    detail: string;
    code: string;
}

// Helper to generate snippets from schema
export const generateSchemaSnippets = (): RoutineSnippet[] => {
    return ROUTINE_SCHEMA.flatMap(table => {
        const alias = table.name; // Use Real Name (PascalCase, e.g. PESPessoa)
        const friendly = table.alias; // Friendly alias (e.g. Pessoa)
        const capitalName = friendly.charAt(0).toUpperCase() + friendly.slice(1);
        const pkField = table.fields.find(f => f.pk)?.name || 'id';

        return [
            {
                label: `${capitalName} - Buscar Vários`,
                detail: `Lista registros de ${friendly} com filtro`,
                code: `const lista${capitalName} = await context.db.${alias}.findMany({
    where: {
        // Ex: Nome: { contains: 'Maria' }
    },
    take: 10,
    orderBy: {
        ${pkField}: 'desc'
    }
});
console.log(\`Encontrados \${lista${capitalName}.length} registros de ${friendly}\`);

`
            },
            {
                label: `${capitalName} - Buscar Um (por ID)`,
                detail: `Busca um único registro de ${friendly}`,
                code: `const ${alias} = await context.db.${alias}.findFirst({
    where: {
        ${pkField}: 1
    }
});
if (${alias}) {
    console.log('${friendly} encontrada:', ${alias});
} else {
    console.log('${friendly} não encontrada');
}
    `
            },
            {
                label: `${capitalName} - Criar Novo`,
                detail: `Insere um novo registro de ${friendly}`,
                code: `const novo${capitalName} = await context.db.${alias}.create({
    data: {
        // Preencha os campos obrigatórios aqui
        // Ex: Nome: 'Novo Registro'
    }
});
console.log('${friendly} criada com ID:', novo${capitalName}.${pkField});

`
            },
            {
                label: `${capitalName} - Atualizar (por ID)`,
                detail: `Atualiza um registro de ${friendly}`,
                code: `const atualizado = await context.db.${alias}.update({
    where: {
        ${pkField}: 1
    },
    data: {
        // Campos para atualizar
    }
});
console.log('${friendly} atualizada!');

`
            }
        ];
    });
};

export const STATIC_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Log Info',
        detail: 'Registra uma mensagem de informação no console',
        code: `console.info('Message');`,
    },
    {
        label: 'Log Error',
        detail: 'Registra uma mensagem de erro no console',
        code: `console.error('Error message');`,
    },
    {
        label: 'Iterar Equipamentos',
        detail: 'Percorre todos os equipamentos ativos',
        code: `for (const eqp of context.adapters.equipamentos) {
    console.log(\`Processando equipamento: \${eqp.descricao} (\${eqp.ip})\`);
    // Sua lógica aqui
}`,
    },
    {
        label: 'Consultar Banco de Dados (Buscar Vários)',
        detail: 'Busca pessoas acessíveis',
        code: `const pessoas = await context.db.PESPessoa.findMany({
    where: {
        PESNome: { contains: 'Maria' }
    },
    take: 10
});
console.log(\`Encontradas \${pessoas.length} pessoas\`);`,
    },
    {
        label: 'Consultar Banco de Dados (Criar)',
        detail: 'Cria um novo registro',
        code: `const novaPessoa = await context.db.PESPessoa.create({
    data: {
        PESNome: 'Nova Pessoa',
        // ... outros campos
    }
});
`,
    },
    {
        label: 'Requisição HTTP (Axios) - Básico',
        detail: 'Faz uma requisição GET simples',
        code: `const resp = await axios.get('https://api.example.com/data');
console.log('Status:', resp.status);
console.log('Dados:', resp.data);`,
    },
    {
        label: 'Requisição HTTP (Axios) - Instância',
        detail: 'Cria uma instância com BaseURL e Headers (Cache, Auth)',
        code: `// Cria uma instância reutilizável para o ERP
const api = axios.create({
    baseURL: 'https://api.meuerp.com/v1',
    timeout: 5000,
    headers: {
        'Authorization': 'Bearer SEU_TOKEN',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// Faz a requisição usando a instância
try {
    const { data } = await api.post('/sync/pessoas', {
        id: 1,
        nome: 'Teste'
    });
    console.log('Sincronizado com sucesso:', data);
} catch (error) {
    console.error('Falha na integração:', error.message);
}`,
    },
];

export const PRISMA_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Prisma - Where (Operadores)',
        detail: 'Exemplos de filtros: equals, contains, in, gt, lt',
        code: `const resultados = await context.db.PESPessoa.findMany({
    where: {
        // Igualdade exata
        PESAtivo: true,
        
        // Contém texto (Case insensitive)
        PESNome: { contains: 'Silva', mode: 'insensitive' },
        
        // Maior/Menor que
        PESCodigo: { gt: 100 }, // Maior que
        // PESCodigo: { gte: 100 }, // Maior ou igual
        // PESCodigo: { lt: 50 },   // Menor que
        
        // Dentro de uma lista (IN)
        PESGrupo: { in: ['ALUNO', 'PROFESSOR'] },
        
        // Negação (NOT)
        PESEmail: { not: null }
    }
});
`,
    },
    {
        label: 'Prisma - Operadores Lógicos (AND/OR)',
        detail: 'Combinação de condições com AND e OR',
        code: `const resultados = await context.db.PESPessoa.findMany({
    where: {
        OR: [
            { PESNome: { contains: 'João' } },
            { PESEmail: { contains: 'joao@' } }
        ],
        AND: [
            { PESAtivo: true },
            { PESGrupo: 'ALUNO' }
        ]
    }
});
`,
    },
    {
        label: 'Prisma - Ordenação (OrderBy)',
        detail: 'Ordenação de resultados (asc/desc)',
        code: `const resultados = await context.db.MATMatricula.findMany({
    orderBy: [
        { MATCurso: 'asc' },   // A-Z
        { createdAt: 'desc' }  // Mais recente primeiro
    ]
});
`,
    },
    {
        label: 'Prisma - Paginação',
        detail: 'Skip e Take para paginar resultados',
        code: `const pagina2 = await context.db.REGRegistroPassagem.findMany({
    skip: 10, // Pula os 10 primeiros
    take: 10, // Pega os próximos 10
    orderBy: { REGTimestamp: 'desc' }
});
`,
    },
    {
        label: 'Prisma - Relacionamentos (Include/Join)',
        detail: 'Traz dados de tabelas relacionadas',
        code: `const matriculas = await context.db.MATMatricula.findMany({
    where: { MATAtivo: true },
    include: {
        pessoa: true, // Traz os dados da Pessoa relacionada
        // instituicao: true // Se disponível
    }
});
// Acesso: matriculas[0].pessoa.PESNome`,
    },
    {
        label: 'Prisma - Seleção de Campos (Select)',
        detail: 'Retorna apenas campos específicos (Otimização)',
        code: `const nomes = await context.db.PESPessoa.findMany({
    select: {
        PESNome: true,
        PESEmail: true,
        // Relacionamentos também podem ser selecionados
        matriculas: {
            select: { MATCurso: true }
        }
    }
});
`,
    },
    {
        label: 'Prisma - Agrupamento (GroupBy)',
        detail: 'Agrupa resultados (Ex: Contagem por Grupo)',
        code: `// Nota: groupBy pode não estar disponível em todos os proxies
// Verifique a documentação do ORM
const estatisticas = await context.db.PESPessoa.groupBy({
    by: ['PESGrupo'],
    _count: {
        PESCodigo: true
    }
});
`,
    },
];

export const HARDWARE_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Hardware - Sincronizar Pessoa (Completo)',
        detail: 'Sincroniza todos os dados (Tags, Biometria, Mapping) com o equipamento',
        code: `// pescodigo = PESCodigo; id = id do usuário no leitor (ex.: PESIdExterno numérico)
await context.hardware.syncPerson(1, {
    pescodigo: 101,
    id: 501,
    name: "João Silva",
    cpf: "123.456.789-00",
    password: "123",
    faceExtension: "jpg",
    tags: ["123456"],
    faces: ["BASE64_FOTO"],
    fingers: ["TEMPLATE_BIO"]
});`,
    },
    {
        label: 'Hardware - Criar Usuário',
        detail: 'Cria apenas o objeto Usuário no hardware e registra Mapping',
        code: `// (eqp, pescodigo, idNoLeitor, nome, ...): idNoLeitor = PESIdExterno no equipamento
await context.hardware.createPerson(1, 101, 501, "João", "123", "123.456.789-00", 80);`,
    },
    {
        label: 'Hardware - Atualizar Usuário',
        detail: 'Atualiza dados cadastrais do usuário no hardware',
        code: `// (eqp, pescodigo, ...): altera cadastro; id no leitor vem do mapeamento
await context.hardware.modifyPerson(1, 101, "João Novo Nome", "456", "321.654.987-00", 85);`,
    },
    {
        label: 'Hardware - Excluir Usuário',
        detail: 'Remove o usuário do hardware (Baseado no ID do Banco)',
        code: `await context.hardware.deletePerson(101);`,
    },
    {
        label: 'Hardware - Excluir pessoa em todos os equipamentos (institucional)',
        detail:
            'Sem eqpId: remove nos equipamentos ativos da instituição e apaga PESEquipamentoMapeamento desses equipamentos.',
        code: `const out = await context.hardware.deletePersonAcrossInstitution(pessoa.PESCodigo);
console.log(out.deleted, out.failed, out.mappingsRemoved);`,
    },
    {
        label: 'Hardware - Vincular Tag (Cartão)',
        detail: 'Adiciona uma tag/cartão ao usuário no hardware',
        code: `await context.hardware.setTag(101, "987654");`,
    },
    {
        label: 'Hardware - Remover Tag (Cartão)',
        detail: 'Desvincula a tag do hardware',
        code: `await context.hardware.removeTag("987654");`,
    },
    {
        label: 'Hardware - Vincular Face (Foto)',
        detail: 'Envia imagem para reconhecimento facial',
        code: `await context.hardware.setFace(101, "BASE64_DA_IMAGEM", "jpg");`,
    },
    {
        label: 'Hardware - Remover Face (Foto)',
        detail: 'Exclui biometria facial do usuário no hardware',
        code: `await context.hardware.removeFace(101);`,
    },
    {
        label: 'Hardware - Vincular Digitais',
        detail: 'Envia templates de impressão digital para o hardware',
        code: `await context.hardware.setFingers(101, ["TEMPLATE_1", "TEMPLATE_2"]);`,
    },
    {
        label: 'Hardware - Remover Digitais',
        detail: 'Exclui todas as digitais do usuário no hardware',
        code: `await context.hardware.removeFingers(101);`,
    },
    {
        label: 'Hardware - Definir Grupos/Departamentos',
        detail: 'Vincula o usuário a grupos de acesso no hardware',
        code: `await context.hardware.setGroups(101, [1, "TI", 5]);`,
    },
    {
        label: 'Hardware - Remover Grupos/Departamentos',
        detail: 'Remove o vínculo do usuário com grupos específicos',
        code: `await context.hardware.removeGroups(101, [1, 5]);`,
    },
    {
        label: 'Hardware - Executar Ação (Comando)',
        detail: 'Envia um comando direto (Ex: Abrir porta, Liberar catraca)',
        code: `// Ex: Abrir porta do Equipamento 1
await context.hardware.executeAction(1, "open_door", { door: 1 });`,
    },
    {
        label: 'Hardware - Modo Cadastro Remoto (Enroll)',
        detail: 'Coloca o equipamento em modo de captura de biometria/face',
        code: `// Enroll de face no Equipamento 1 para o Usuário 101
await context.hardware.enroll(1, "face", 101);`,
    },
    {
        label: 'Hardware - Comando Customizado (Raw)',
        detail: 'Envia comandos específicos do fabricante (Ex: ControlID .fcgi)',
        code: `// Ex: load_objects nativo do ControlID
const users = await context.hardware.customCommand(1, "load_objects", {
    object: "users",
    limit: 10
});
console.log(users);`,
    },
];

export const WEBHOOK_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Webhook - Acessar Body',
        detail: 'Recupera dados enviados no corpo da requisição POST/PUT',
        code: `const body = context.request?.body;
console.log('Dados recebidos:', body);
// Ex: const nome = body?.cliente?.nome;
`,
    },
    {
        label: 'Webhook - Acessar Query Params',
        detail: 'Recupera parâmetros da URL (ex: ?id=123)',
        code: `const query = context.request?.query;
const id = query?.id;
console.log('Query ID:', id);
`,
    },
    {
        label: 'Webhook - Acessar Headers',
        detail: 'Recupera cabeçalhos HTTP da requisição',
        code: `const headers = context.request?.headers;
const contentType = headers?.['content-type'];
console.log('Content-Type:', contentType);
`,
    },
    {
        label: 'Webhook - Verificar Método HTTP',
        detail: 'Identifica se é GET, POST, DELETE, etc.',
        code: `const method = context.request?.method;
if (method === 'POST') {
    console.log('Processando criação...');
}
`,
    },
    {
        label: 'Webhook - Parâmetros de Rota (Slug)',
        detail: 'Acessa o slug da rota e parâmetros dinâmicos',
        code: `const path = context.request?.path;
console.log('Acessado via rota:', path);

// Se a rota tiver parâmetros extras configurados no sistema:
const params = context.request?.params;
`,
    },
];

export const CONFIG_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Configuração - Obter Dados do ERP',
        detail: 'Recupera URL, Token e parâmteros do ERP vinculado',
        code: `// Busca a configuração do ERP da instituição
const erp = await context.db.ERPConfiguracao.findFirst();

if (erp) {
    console.log(\`Integrado com: \${erp.ERPSistema}\`);
    console.log(\`URL Base: \${erp.ERPUrlBase}\`);
    // const token = erp.ERPToken;
} else {
    console.warn('Nenhuma configuração de ERP encontrada.');
}`,
    },
    {
        label: 'Configuração - Obter Dados da Instituição',
        detail: 'Recupera o nome e parâmetros globais da Unidade',
        code: `// Busca os dados da instituição atual (Isolado via RLS)
const inst = await context.db.INSInstituicao.findFirst();

if (inst) {
    console.log(\`Instituição: \${inst.INSNome}\`);
    // const hwConfig = inst.INSConfigHardware;
} else {
    console.error('Dados da instituição não encontrados.');
}`,
    },
];

export const LOGGER_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Logger - Gravar Log em Arquivo',
        detail: 'Grava mensagem com prefixo [LOG] no arquivo .txt diário',
        code: `logger.log('Processando dados...');`,
    },
    {
        label: 'Logger - Gravar Info em Arquivo',
        detail: 'Grava mensagem com prefixo [INFO] no arquivo .txt diário',
        code: `logger.info('Encontrados 42 registros');`,
    },
    {
        label: 'Logger - Gravar Erro em Arquivo',
        detail: 'Grava mensagem com prefixo [ERR] no arquivo .txt diário',
        code: `logger.error('Falha ao conectar no ERP');`,
    },
    {
        label: 'Logger - Exemplo Completo (Try/Catch)',
        detail: 'Uso combinado de logger em fluxo com tratamento de erros',
        code: `logger.info('Iniciando sincronização...');

try {
    const pessoas = await context.db.PESPessoa.findMany({ where: { PESAtivo: true } });
    logger.log(\`Encontradas \${pessoas.length} pessoas ativas\`);

    for (const p of pessoas) {
        // ... processar
    }

    logger.info('Sincronização concluída com sucesso');
} catch (error) {
    logger.error(\`Erro na sincronização: \${error.message}\`);
}`,
    },
];

export const FILE_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Imagens - Baixar e Converter (Base64)',

        detail: 'Baixa imagem via URL, detecta extensão e converte para Base64',
        code: `// URL da foto (Ex: vinda do ERP)
const photoUrl = 'https://api.meuerp.com/photos/123.jpg';

try {
    const response = await axios.get(photoUrl, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const contentType = response.headers['content-type'] || 'image/jpeg';
    
    let extension = 'jpg';
    if (contentType.includes('/')) {
        extension = contentType.split('/')[1];
    }

    console.log('Foto convertida. Extensão:', extension);
    // console.log('Base64:', base64);

    // Dica: Use no campo PESFotoBase64 e PESFotoExtensao do banco
    // ou diretamente no hardware via context.hardware.setFace
} catch (error) {
    console.error('Erro ao baixar foto:', error.message);
}`,
    },
];

export const ALL_SNIPPETS: RoutineSnippet[] = [
    ...STATIC_SNIPPETS,
    ...LOGGER_SNIPPETS,
    ...PRISMA_SNIPPETS,
    ...HARDWARE_SNIPPETS,
    ...WEBHOOK_SNIPPETS,
    ...CONFIG_SNIPPETS,
    ...FILE_SNIPPETS,
    ...generateSchemaSnippets()
];
