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

        const snippets: RoutineSnippet[] = [
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
        ];

        // Tabelas somente leitura (ex.: turmas): a engine bloqueia escrita — sem snippets de criar/atualizar.
        if (table.readOnly) return snippets;

        return [
            ...snippets,
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
            'Sem eqpId: remove nos equipamentos ativos da instituição e apaga PESEquipamentoMapeamento apenas dos equipamentos em que a remoção foi confirmada.',
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
        detail: 'Substitui os grupos de acesso do usuário no hardware — os vínculos anteriores são removidos. Apenas ids numéricos.',
        code: `await context.hardware.setGroups(101, [1, 5]);`,
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

/**
 * Controle de acesso por turma — context.turmas (mesmas regras da tela Turmas).
 * Entrada e saída são controladas separadamente por área (Control iD):
 *   interna = entrada na Área Interna (Área Externa → Área Interna, entrar na escola)
 *   externa = entrada na Área Externa (Área Interna → Área Externa, sair da escola)
 * Tabelas TRMTurma, PHAPerfilHorario, PHAJanela, TEQTurmaEquipamento, PHEPerfilEquipamento e
 * EQSEquipamentoSentido são somente leitura em context.db: alterações passam por context.turmas.
 */
export const TURMAS_SNIPPETS: RoutineSnippet[] = [
    {
        label: 'Turmas - Listar turmas (filtros)',
        detail: 'context.turmas.listar: turno, ano, curso, série, perfil, equipamento, validacaoAtiva',
        code: `// Filtros opcionais: ano, curso, serie, turno, perfil (PHACodigo), equipamento (EQPCodigo),
// validacaoAtiva (true/false), ativa (true | false | 'todas'), busca, page, limit (máx. 200)
const { data: turmas, meta } = await context.turmas.listar({
    turno: 'matutino',
    validacaoAtiva: true,
    limit: 200,
});
console.log(\`\${meta.total} turma(s)\`);
for (const t of turmas) {
    // perfil.modos: { interna, externa } = 'livre' | 'horario' | 'bloqueado'
    // sync.semSentido: equipamentos do escopo sem Área Interna/Externa preparadas
    console.log(t.TRMCodigo, t.TRMSerie, t.TRMTurma, t.TRMTurno, t.perfil?.PHANome ?? '-', t.perfil?.modos, t.sync);
}`,
    },
    {
        label: 'Turmas - Detalhe da turma (entrada, saída, escopo, equipamentos)',
        detail: 'context.turmas.obter: regras por sentido, forma canônica, equipamentos e status de sync',
        code: `const turma = await context.turmas.obter(TRMCodigo);
console.log(turma.rotulo, '| perfil:', turma.perfil?.PHANome ?? '(nenhum)');
// regras: { interna: { modo, horarios? }, externa: { modo, horarios? } }
console.log('entrada na Área Interna:', JSON.stringify(turma.regras?.interna));
console.log('entrada na Área Externa:', JSON.stringify(turma.regras?.externa));
// canonico: minutos liberados por dia (dom..sab) — o mesmo usado no diagrama da tela
console.log('canônico:', JSON.stringify(turma.canonico));
console.log('escopo:', turma.escopo.todos ? 'todos os equipamentos' : turma.escopo.EQPCodigos);
for (const e of turma.equipamentos.filter((x) => x.noEscopo)) {
    const estado = !e.suportado ? 'sem suporte' : !e.sentido.preparado ? 'áreas não preparadas' : (e.sync?.status ?? 'pendente');
    console.log(e.EQPDescricao, estado, e.sentido.validado ? 'validado' : 'validação pendente', e.sync?.erro ?? '');
}`,
    },
    {
        label: 'Turmas - Ativar controle de acesso (entrada e saída + equipamentos)',
        detail: 'context.turmas.salvarValidacao: regra por sentido; cria/reutiliza o perfil e sincroniza',
        code: `// modo: 'livre' (sempre liberado) | 'horario' (somente nas faixas) | 'bloqueado'
// dias: 7 posições [dom, seg, ter, qua, qui, sex, sab]; fim menor que início = cruza a meia-noite
const SEG_SEX = [false, true, true, true, true, true, false];
const r = await context.turmas.salvarValidacao(TRMCodigo, {
    ativa: true,
    regras: {
        // Entrada na Área Interna (Externa → Interna): entrar na escola
        interna: {
            modo: 'horario',
            horarios: [
                { inicio: '06:30', fim: '07:30', dias: SEG_SEX },
                { inicio: '12:50', fim: '13:10', dias: SEG_SEX },
            ],
        },
        // Entrada na Área Externa (Interna → Externa): sair da escola
        externa: { modo: 'horario', horarios: [{ inicio: '12:00', fim: '12:30', dias: SEG_SEX }] },
    },
    // { todos: true } = todos os equipamentos com áreas preparadas, inclusive os futuros
    escopo: { todos: false, EQPCodigos: [1, 2, 3] },
});
console.log('perfil:', r.perfil?.PHANome, r.perfil?.criado ? '(criado)' : '(reutilizado)');
console.log('cadastros regravados por mudança de escopo:', r.pessoasInvalidadas);
for (const x of r.resultados) console.log(x.EQPDescricao, x.PHANome, x.status, x.mensagem ?? '');`,
    },
    {
        label: 'Turmas - Entrada livre e saída somente no horário',
        detail: 'Exemplo da spec Control iD: entra a qualquer hora, sai só na janela de saída',
        code: `const r = await context.turmas.salvarValidacao(TRMCodigo, {
    ativa: true,
    regras: {
        interna: { modo: 'livre' }, // sem faixas: 24 h em todos os dias e feriados
        externa: {
            modo: 'horario',
            horarios: [{ inicio: '17:00', fim: '18:00', dias: [false, true, true, true, true, true, false] }],
        },
    },
    escopo: { todos: true },
});
// Os dois sentidos 'bloqueado' ao mesmo tempo é recusado (ninguém passaria).
console.log(r.perfil?.PHANome, r.resultados.map((x) => \`\${x.EQPDescricao}: \${x.status}\`));`,
    },
    {
        label: 'Turmas - Desativar controle de acesso',
        detail: 'Perfil e escopo ficam guardados; as regras saem dos equipamentos quando o grupo esvaziar',
        code: `const r = await context.turmas.salvarValidacao(TRMCodigo, {
    ativa: false,
    escopo: { todos: true },
});
// "aguardando_membros" é esperado: as pessoas ainda estão no departamento até a
// rotina de vínculo + rotina de gravação (#5) as devolverem ao grupo padrão.
console.log(r.resultados.map((x) => \`\${x.EQPDescricao}: \${x.status}\`));`,
    },
    {
        label: 'Turmas - Mesma regra para várias turmas (lote)',
        detail: 'context.turmas.salvarValidacaoEmLote: todas vão para o mesmo perfil',
        code: `const { data } = await context.turmas.listar({ turno: 'vespertino', limit: 200 });
const SEG_SEX = [false, true, true, true, true, true, false];
const r = await context.turmas.salvarValidacaoEmLote(
    data.map((t) => t.TRMCodigo),
    {
        ativa: true,
        regras: {
            interna: { modo: 'horario', horarios: [{ inicio: '12:30', fim: '13:30', dias: SEG_SEX }] },
            externa: { modo: 'horario', horarios: [{ inicio: '18:00', fim: '18:45', dias: SEG_SEX }] },
        },
        escopo: { todos: true },
    },
);
console.log(\`\${r.TRMCodigos.length} turma(s) no perfil \${r.perfil?.PHANome}\`);`,
    },
    {
        label: 'Turmas - Verificar regras antes de salvar (preview)',
        detail: 'context.turmas.previewPerfil: erros por sentido, forma canônica e perfil existente/novo',
        code: `const p = await context.turmas.previewPerfil(
    {
        interna: { modo: 'livre' },
        externa: { modo: 'horario', horarios: [{ inicio: '11:30', fim: '12:00', dias: [false, true, true, true, true, true, false] }] },
    },
    TRMCodigo, // opcional: usado para sugerir o nome pelo turno
);
if (p.erros.length) {
    console.error('Regra inválida:', p.erros); // ex.: "Entrada na Área Externa: Faixas 1 e 2 se sobrepõem em Seg"
} else if (p.perfilExistente) {
    console.log('Agrupa no perfil', p.perfilExistente.PHANome, 'com', p.perfilExistente.turmas);
} else {
    console.log('Será criado o perfil', p.nomeSugerido);
}`,
    },
    {
        label: 'Turmas - Listar perfis de horário',
        detail: 'context.turmas.listarPerfis: regras por sentido, turmas e estado nos equipamentos',
        code: `const perfis = await context.turmas.listarPerfis();
const resumo = (r) => (r.modo === 'horario' ? r.horarios.map((h) => \`\${h.inicio}-\${h.fim}\`).join(', ') : r.modo);
for (const p of perfis) {
    console.log(
        p.PHANome,
        \`entrada: \${resumo(p.regras.interna)} | saída: \${resumo(p.regras.externa)}\`,
        p.emUso ? p.turmas.map((t) => t.rotulo).join('; ') : '(sem uso)',
        \`\${p.equipamentos.sincronizados}/\${p.equipamentos.total} em dia\`,
        p.equipamentos.semSentido ? \`\${p.equipamentos.semSentido} sem áreas\` : '',
        p.removendo.length ? \`removendo de \${p.removendo.length}\` : '',
    );
}`,
    },
    {
        label: 'Turmas - Renomear perfil de horário',
        detail: 'Máx. 15 bytes; renomeia no equipamento e reenvia as pessoas do perfil',
        code: `// Atenção: todas as pessoas do perfil são reenviadas aos equipamentos (inclusive foto)
const r = await context.turmas.renomearPerfil(PHACodigo, 'MANHA-A');
console.log(r.PHANome, r.resultados.map((x) => \`\${x.EQPDescricao}: \${x.status}\`));`,
    },
    {
        label: 'Turmas - Preparar Área Interna/Externa nos equipamentos',
        detail: 'context.turmas.prepararSentidoEquipamento: pré-requisito para aplicar regras de turma',
        code: `// Cria (ou reaproveita) "Área Interna", "Área Externa" e os portais
// "Entrada Área Interna" (Externa → Interna) e "Entrada Área Externa" (Interna → Externa).
// Copia as regras gerais do equipamento para os portais novos e aplica os perfis. Idempotente.
const equipamentos = await context.turmas.listarEquipamentosSentido();
for (const e of equipamentos.filter((x) => x.EQPAtivo && x.suportado && !x.sentido.preparado)) {
    try {
        const r = await context.turmas.prepararSentidoEquipamento(e.EQPCodigo);
        console.info(e.EQPDescricao, 'portais:', JSON.stringify(r.sentido.portais));
        for (const alerta of r.alertas) console.warn(e.EQPDescricao, alerta); // ex.: catra_default_fsm diferente de "0"
    } catch (err) {
        console.error(e.EQPDescricao, err.message);
    }
}`,
    },
    {
        label: 'Turmas - Diagnóstico de áreas e catraca do equipamento',
        detail: 'context.turmas.lerSentidoEquipamento: lê sec_box, áreas e portais sem alterar nada',
        code: `const d = await context.turmas.lerSentidoEquipamento(EQPCodigo);
console.log('preparado:', d.sentido.preparado, '| invertido:', d.sentido.invertido, '| validado em:', d.sentido.validadoEm);
for (const h of d.leitura.catra) {
    console.log(h.host, 'role', h.catra_role, 'side_to_enter', h.catra_side_to_enter, 'default_fsm', h.catra_default_fsm, h.erro ?? '');
}
const nomeArea = (id) => d.leitura.areas.find((a) => a.id === id)?.nome ?? id;
for (const p of d.leitura.portais) console.log(\`portal #\${p.id} \${p.nome}: \${nomeArea(p.areaFromId)} → \${nomeArea(p.areaToId)}\`);
if (d.alertas.length) console.warn(d.alertas);`,
    },
    {
        label: 'Turmas - Resultado do teste em bancada (inverter / validar)',
        detail: 'context.turmas.atualizarSentidoEquipamento: portais trocados ou sentidos conferidos',
        code: `// Entrada e saída trocadas no teste físico: inverte e regrava as regras de todas as turmas no equipamento
const inv = await context.turmas.atualizarSentidoEquipamento(EQPCodigo, { invertido: true });
console.log(inv.sentido.portais, inv.resultados.map((x) => \`\${x.PHANome}: \${x.status}\`));

// Depois de conferir que entra e sai conforme a regra:
await context.turmas.atualizarSentidoEquipamento(EQPCodigo, { validado: true });`,
    },
    {
        label: 'Turmas - Conferir a regra aplicada no equipamento',
        detail: 'context.turmas.lerRegraAplicada: lê departamento, regras por portal e horários e compara',
        code: `const turma = await context.turmas.obter(TRMCodigo);
for (const e of turma.equipamentos.filter((x) => x.noEscopo && x.suportado && x.sentido.preparado)) {
    try {
        const r = await context.turmas.lerRegraAplicada(TRMCodigo, e.EQPCodigo);
        // r.aplicado: { interna: { modo, dias, regras, bloqueios }, externa: {...} } (null = departamento não existe)
        if (r.diferencas.length) console.warn(e.EQPDescricao, 'DIVERGENTE:', r.diferencas);
        else console.info(e.EQPDescricao, 'em conformidade |', r.membros, 'pessoa(s) no departamento');
    } catch (err) {
        console.error(e.EQPDescricao, err.message);
    }
}`,
    },
    {
        label: 'Turmas - Departamento da pessoa em cada equipamento',
        detail: 'context.turmas.gruposNoEquipamentos: perfil nos equipamentos do escopo com áreas preparadas, PESGrupo nos demais',
        code: `const equipamentos = await context.db.EQPEquipamento.findMany({ where: { EQPAtivo: true } });
const grupos = await context.turmas.gruposNoEquipamentos(
    PESCodigo,
    equipamentos.map((e) => e.EQPCodigo),
);
// chaves = EQPCodigo em string
for (const e of equipamentos) {
    console.log(e.EQPDescricao, '→', grupos[String(e.EQPCodigo)] ?? '(sem grupo)');
}`,
    },
    {
        label: 'Turmas - Gravar pessoa com departamento por equipamento',
        detail: 'Padrão da rotina #5: não carimbar o hash se o departamento não foi aplicado',
        code: `const grupos = await context.turmas.gruposNoEquipamentos(pessoa.PESCodigo, [eqpId]);
const retorno = await context.hardware.syncPerson(eqpId, {
    pescodigo: pessoa.PESCodigo,
    id: Number(pessoa.PESIdExterno) || pessoa.PESCodigo,
    name: pessoa.PESNome,
    grupo: grupos[String(eqpId)] ?? undefined,
    tags: pessoa.PESCartaoTag ? [pessoa.PESCartaoTag] : [],
    faces: pessoa.PESFotoBase64 ? [pessoa.PESFotoBase64] : [],
    faceExtension: pessoa.PESFotoExtensao || 'jpg',
});

if (retorno.grupo && retorno.grupo.aplicado === false) {
    // Grupo inexistente no equipamento ou falha: NÃO grave PEQSyncHash/PEQSyncedAt,
    // para a pessoa continuar pendente e ser reenviada.
    console.warn('departamento não aplicado:', retorno.grupo);
} else {
    await context.db.PESEquipamentoMapeamento.updateMany({
        where: { PESCodigo: pessoa.PESCodigo, EQPCodigo: eqpId },
        data: { PEQSyncHash: utils.hash({ /* payload enviado */ }), PEQSyncedAt: new Date() },
    });
}`,
    },
    {
        label: 'Turmas - Reenviar perfis aos equipamentos',
        detail: 'context.turmas.sincronizar: por turma, por perfil ou tudo; forcar ignora o hash',
        code: `// Informe TRMCodigo OU PHACodigo (sem nenhum = todos os perfis). EQPCodigos restringe os equipamentos.
const r = await context.turmas.sincronizar({ TRMCodigo, forcar: true });
console.log(r.resumo); // ex.: { aplicado: 2, erro: 1, sentido_nao_preparado: 1 }`,
    },
    {
        label: 'Turmas - Reconciliar equipamentos (rotina C)',
        detail: 'Equipamento offline, equipamento novo, perfil sem uso, perfis legados e grupos padrão ausentes',
        code: `const r = await context.turmas.reconciliar(); // ou { EQPCodigos: [1, 2] }
console.info('resumo:', JSON.stringify(r.resumo));
if (r.perfisLegadosNormalizados) console.info('perfis anteriores ao controle por sentido normalizados:', r.perfisLegadosNormalizados);
for (const a of r.gruposPadraoAusentes) {
    console.error(\`\${a.EQPDescricao}: faltam os grupos \${a.faltando.join(', ')}\`);
}
return r;`,
    },
    {
        label: 'Turmas - Vincular pessoas às turmas (rotina B)',
        detail: 'Elege a turma efetiva e grava PESTRMCodigo/PESGrupoHorario só quando muda',
        code: `const r = await context.turmas.vincularPessoas();
console.info(\`avaliadas: \${r.avaliadas} | alteradas: \${r.alteradas} | conflitos: \${r.conflitos}\`);
return r;`,
    },
    {
        label: 'Turmas - Importar catálogo do ERP (rotina A)',
        detail: 'context.turmas.importarCatalogo: catálogo COMPLETO; turmas ausentes são desativadas',
        code: `// Monte a lista a partir do ERP. Se qualquer leitura falhar, ABORTE antes de chamar:
// turmas que não vierem são desativadas e seus alunos ficam sem restrição de horário.
const turmas = [
    {
        idExterno: '123',          // idClass
        idOferta: '45',            // idCurriculumOffer
        nome: '3º Ano A',          // name
        curso: 'Ensino Médio',     // courseName
        serie: '3ª série',         // moduleName
        turno: 'matutino',         // shiftName
        anoReferencia: '2026',     // referenceYear
    },
];
// idExterno da turma → idEnrollment dos alunos (= MATMatricula.MATNumero)
const matriculasPorTurma = { '123': ['9001', '9002'] };

const r = await context.turmas.importarCatalogo({ turmas, matriculasPorTurma });
console.info(JSON.stringify(r)); // criadas, atualizadas, desativadas, matriculasSemTurma, matriculasAmbiguas`,
    },
    {
        label: 'Turmas - Importar configuração do ano anterior',
        detail: 'Sugestões por curso+série+turma+turno e importação dos pares escolhidos',
        code: `const { pares, turmasSemConfiguracao } = await context.turmas.sugestoesImportacaoAnoAnterior();
console.log(\`\${turmasSemConfiguracao} turma(s) sem configuração, \${pares.length} sugestão(ões)\`);
for (const p of pares) {
    console.log(p.destino.rotulo, '←', p.origem.rotulo, p.origem.PHANome, 'entrada:', p.origem.regras.interna.modo, 'saída:', p.origem.regras.externa.modo);
}

// Revise antes: horários costumam mudar de um ano para outro
const r = await context.turmas.importarAnoAnterior(
    pares.map((p) => ({ TRMCodigoOrigem: p.origem.TRMCodigo, TRMCodigoDestino: p.destino.TRMCodigo })),
);
console.log('importadas:', r.importadas, 'falhas:', r.falhas);`,
    },
    {
        label: 'Turmas - Consultar turmas, perfis e áreas via context.db (leitura)',
        detail: 'Tabelas de turma são somente leitura em context.db',
        code: `const turmas = await context.db.TRMTurma.findMany({
    where: { TRMValidacaoAtiva: true, TRMAtiva: true },
    include: {
        perfil: { include: { janelas: { orderBy: [{ PHJSentido: 'asc' }, { PHJOrdem: 'asc' }] } } },
        escopo: { select: { EQPCodigo: true } },
    },
    orderBy: [{ TRMSerie: 'asc' }, { TRMTurma: 'asc' }],
});
for (const t of turmas) {
    if (!t.perfil) continue;
    const faixas = (sentido) =>
        t.perfil.janelas.filter((j) => j.PHJSentido === sentido).map((j) => \`\${j.PHJHoraInicio}-\${j.PHJHoraFim}\`).join(', ');
    console.log(
        t.TRMSerie, t.TRMTurma, t.perfil.PHANome,
        \`entrada: \${t.perfil.PHAModoInterna} \${faixas('INTERNA')}\`,
        \`saída: \${t.perfil.PHAModoExterna} \${faixas('EXTERNA')}\`,
        t.TRMTodosEquipamentos ? 'todos' : t.escopo.map((e) => e.EQPCodigo),
    );
}
const areas = await context.db.EQSEquipamentoSentido.findMany({ select: { EQPCodigo: true, EQSPortalInternaId: true, EQSPortalExternaId: true, EQSInvertido: true, EQSValidadoEm: true } });
console.log(areas);
// create/update/delete nessas tabelas é bloqueado: use context.turmas`,
    },
    {
        label: 'Turmas - Tratar resultado por equipamento',
        detail: 'Significado de cada status devolvido ao salvar/sincronizar',
        code: `// aplicado               → regras gravadas no equipamento (departamento + regra por portal)
// sem_mudanca            → já estava igual (nada enviado)
// removido               → perfil retirado do equipamento
// aguardando_membros     → ainda há pessoas no departamento; remoção fica para a reconciliação
// ocupado                → outro processo sincronizando o mesmo equipamento; a reconciliação conclui
// nao_suportado          → marca/modelo sem suporte (só Control iD por enquanto)
// sentido_nao_preparado  → equipamento no escopo sem Área Interna/Externa: prepare as áreas
// inativo                → equipamento inativo, nada enviado
// erro                   → falha de comunicação; fica pendente para a reconciliação
const pendentes = r.resultados.filter((x) => ['erro', 'ocupado', 'aguardando_membros', 'sentido_nao_preparado'].includes(x.status));
if (pendentes.length) console.warn('pendências:', pendentes);`,
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
    ...TURMAS_SNIPPETS,
    ...generateSchemaSnippets()
];
