import React, { useState } from 'react';
import { ROUTINE_SCHEMA } from './RoutineSchema';
import { SchemaVisualizer } from './SchemaVisualizer';
import { CloseIcon, CloseLineIcon, InfoIcon } from '@/icons';

interface RoutineHelperProps {
    onInsertSnippet: (snippet: string) => void;
}

const SNIPPETS = [
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
        code: `const pessoas = await context.db.pessoa.findMany({
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
        code: `const novaPessoa = await context.db.pessoa.create({
    data: {
        PESNome: 'Nova Pessoa',
        // ... outros campos
    }
});`,
    },
    {
        label: 'Requisição HTTP (Axios)',
        detail: 'Faz uma requisição HTTP externa',
        code: `// Nota: Axios está disponível como 'axios' se injetado
// const response = await axios.get('https://api.example.com/data');
// console.log(response.data);`,
    },
];

export function RoutineHelper({ onInsertSnippet }: RoutineHelperProps) {
    const [viewMode, setViewMode] = useState<'snippets' | 'dictionary'>('snippets');
    const [visualizerOpen, setVisualizerOpen] = useState(false);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && visualizerOpen) {
                setVisualizerOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [visualizerOpen]);

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 w-80">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-white">Assistente de Rotina</h3>
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={() => setViewMode('snippets')}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'snippets'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
                            }`}
                    >
                        Snippets
                    </button>
                    <button
                        onClick={() => setViewMode('dictionary')}
                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'dictionary'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200'
                            }`}
                    >
                        Dicionário
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {viewMode === 'snippets' && (
                    <>
                        <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Objetos de Contexto</h4>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-start gap-2">
                                    <code className="text-blue-600 dark:text-blue-400 font-mono text-xs bg-blue-50 dark:bg-blue-900/20 px-1 py-0.5 rounded">context.db</code>
                                    <span className="text-gray-600 dark:text-gray-400">Prisma Client (Isolado)</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <code className="text-blue-600 dark:text-blue-400 font-mono text-xs bg-blue-50 dark:bg-blue-900/20 px-1 py-0.5 rounded">context.adapters</code>
                                    <span className="text-gray-600 dark:text-gray-400">Adaptadores Hardware</span>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Snippets Comuns</h4>
                            <div className="space-y-2">
                                {SNIPPETS.map((snippet, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => onInsertSnippet(snippet.code)}
                                        className="w-full text-left p-2 rounded hover:bg-gray-200 dark:hover:bg-white/5 transition-colors group"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-medium text-gray-700 dark:text-gray-300 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400">{snippet.label}</span>
                                            <span className="opacity-0 group-hover:opacity-100 text-xs text-blue-500">+ Inserir</span>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">{snippet.detail}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {viewMode === 'dictionary' && (
                    <div className="space-y-4">
                        <button
                            onClick={() => setVisualizerOpen(true)}
                            className="w-full py-2 flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800 transition-colors text-sm font-medium"
                        >
                            <InfoIcon className="w-4 h-4" />
                            Visualizar Diagrama (DER)
                        </button>

                        <div className="space-y-6">
                            {ROUTINE_SCHEMA.map(table => (
                                <div key={table.name} className="space-y-2">
                                    <div className="flex items-baseline justify-between border-b border-gray-100 dark:border-gray-800 pb-1">
                                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">{table.alias}</h4>
                                        <span className="text-[10px] font-mono text-gray-400">context.db.{table.alias.toLowerCase()}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 italic mb-2">{table.description}</p>

                                    <div className="space-y-1">
                                        {table.fields.map(field => (
                                            <div key={field.name} className="grid grid-cols-[1fr_auto] gap-2 text-xs py-1 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-white/5 px-1 rounded">
                                                <div className="flex flex-col">
                                                    <span className="font-mono text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                        {field.name}
                                                        {field.pk && <span className="text-[9px] bg-yellow-100 text-yellow-800 px-1 rounded">PK</span>}
                                                        {field.fk && <span className="text-[9px] bg-blue-100 text-blue-800 px-1 rounded">FK</span>}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">{field.description}</span>
                                                </div>
                                                <span className="font-mono text-gray-400 text-[10px]">{field.type}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Schema Visualization Modal */}
            {visualizerOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl flex flex-col relative overflow-hidden h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-20">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-4">Diagrama de Entidade-Relacionamento</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 hidden sm:inline-block mr-2">
                                    Use o mouse para arrastar (pan) e scroll para zoom
                                </span>
                                <button
                                    onClick={() => setVisualizerOpen(false)}
                                    className="flex-shrink-0 p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-gray-300"
                                    title="Fechar (Esc)"
                                >
                                    <CloseLineIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        {/* Remove internal padding/scroll to let Canvas handle it */}
                        <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative overflow-hidden">
                            <SchemaVisualizer />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
