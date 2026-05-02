import React, { useState } from 'react';
import { ROUTINE_SCHEMA } from './RoutineSchema';
import { SchemaVisualizer } from './SchemaVisualizer';
import { CloseLineIcon, InfoIcon } from '@/icons';
import { ALL_SNIPPETS as SNIPPETS } from './RoutineSnippets';

interface RoutineHelperProps {
    onInsertSnippet: (snippet: string) => void;
}

/**
 * Referência alinhada a IHardwareProvider + métodos institucionais (worker + webapi).
 * Em rotinas, o proxy exige equipmentId (EQPCodigo) como 1º argumento em todo método
 * de equipamento; exceções: institutional: true (sem eqpId na chamada).
 */
const HARDWARE_REFERENCE: {
    method: string;
    params: string;
    notes?: string;
    /** Métodos de âmbito institucional: sem eqpId na chamada (ex.: deletePersonAcrossInstitution). */
    institutional?: boolean;
}[] = [
    {
        method: 'syncPerson',
        params: 'person: { pescodigo, id, name, ... } (pescodigo=PESCodigo; id=id no leitor / PESIdExterno)',
        notes: 'Sincroniza cadastro completo (incl. departamento via grupo).',
    },
    {
        method: 'createPerson',
        params: 'pescodigo, id, name, password?, cpf?, limiar?, grupo?',
    },
    {
        method: 'modifyPerson',
        params: 'pescodigo, name, password?, cpf?, limiar?, grupo?',
        notes: 'Mapeamento por PESCodigo; id no leitor vem de PESEquipamentoMapeamento.',
    },
    { method: 'deletePerson', params: 'idUsuario' },
    { method: 'setTag', params: 'userId, tag' },
    { method: 'removeTag', params: 'tag' },
    { method: 'setFace', params: 'userId, faceBase64, extension' },
    { method: 'removeFace', params: 'userId' },
    { method: 'setFingers', params: 'userId, templates[]' },
    { method: 'removeFingers', params: 'userId' },
    {
        method: 'setGroups',
        params: 'userId, groupIds: (number|string)[]',
        notes:
            'Departamentos/grupos no equipamento. Na rotina: await context.hardware.setGroups(eqpId, userId, groupIds) — userId é o id no leitor, não o EQPCodigo.',
    },
    {
        method: 'removeGroups',
        params: 'userId, groupIds: (number|string)[]',
        notes: 'Na rotina: await context.hardware.removeGroups(eqpId, userId, groupIds).',
    },
    { method: 'executeAction', params: 'action, params?' },
    { method: 'enroll', params: "'face' | 'biometry', userId" },
    { method: 'customCommand', params: 'cmd, params?' },
    {
        method: 'testConnection',
        params: 'nenhum outro parâmetro',
        notes: 'Retorno: { ok, deviceId?, info?, error? }.',
    },
    {
        method: 'applyEquipmentConfiguration',
        params: 'device, tipo',
        notes: 'device: registro EQPEquipamento (ex.: await db.Equipamento.findFirst(...)). tipo: "GERAL" | "BOX" | "WEBHOOK".',
    },
    {
        method: 'deletePersonAcrossInstitution',
        params: 'pescodigo',
        institutional: true,
        notes:
            'Remove a pessoa de todos os equipamentos ativos da instituição e apaga linhas em PESEquipamentoMapeamento desses equipamentos.',
    },
];

const HARDWARE_INSERT_EXAMPLES: { label: string; detail: string; code: string }[] = [
    {
        label: 'Testar conexão com o equipamento',
        detail: 'Útil no início da rotina para validar rede/relay.',
        code: `const r = await context.hardware.testConnection(eqpId);
console.log('hardware', r.ok, r.deviceId, r.error);`,
    },
    {
        label: 'Sincronizar uma pessoa (objeto completo)',
        detail: 'grupo casa com PESGrupo / departamentos no Control iD.',
        code: `await context.hardware.syncPerson(eqpId, {
  pescodigo: pessoa.PESCodigo,
  id: Number(pessoa.PESIdExterno) || pessoa.PESCodigo,
  name: pessoa.PESNome,
  cpf: pessoa.PESDocumento || undefined,
  grupo: pessoa.PESGrupo || undefined,
  tags: pessoa.PESCartaoTag ? [pessoa.PESCartaoTag] : [],
  faces: pessoa.PESFotoBase64 ? [pessoa.PESFotoBase64] : [],
  faceExtension: pessoa.PESFotoExtensao || 'jpg',
  fingers: [],
});`,
    },
    {
        label: 'Comando customizado (Control iD / API do provider)',
        detail: 'Ex.: load_objects com session interna do provider.',
        code: `const data = await context.hardware.customCommand(eqpId, 'load_objects', {
  object: 'users',
});
console.log(data);`,
    },
    {
        label: 'Aplicar configuração no equipamento (GERAL / BOX / WEBHOOK)',
        detail: 'Carregue o device do Prisma antes; o eqpId deve ser o mesmo registro.',
        code: `const device = await db.Equipamento.findFirst({
  where: { EQPCodigo: eqpId },
});
if (device) {
  await context.hardware.applyEquipmentConfiguration(eqpId, device, 'WEBHOOK');
}`,
    },
    {
        label: 'Excluir pessoa de todos os equipamentos (institucional)',
        detail: 'Não usa eqpId; percorre equipamentos ativos e limpa mappings no fim.',
        code: `const result = await context.hardware.deletePersonAcrossInstitution(pessoa.PESCodigo);
console.log('deleted', result.deleted, 'failed', result.failed, 'mappings', result.mappingsRemoved);`,
    },
    {
        label: 'Definir grupos / departamentos no hardware',
        detail: 'eqpId = EQPCodigo no OpenTurn; userId = id da pessoa no leitor (ex.: PESIdExterno).',
        code: `// 1º argumento obrigatório: código do equipamento (EQPCodigo), não o id do usuário no leitor
await context.hardware.setGroups(eqpId, userIdNoLeitor, [1, 2]);`,
    },
];

export function RoutineHelper({ onInsertSnippet }: RoutineHelperProps) {
    const [viewMode, setViewMode] = useState<'snippets' | 'dictionary'>('snippets');
    const [visualizerOpen, setVisualizerOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

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
        <div className="h-full flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 w-full">
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
                                    <code className="text-blue-600 dark:text-blue-400 font-mono text-xs bg-blue-50 dark:bg-blue-900/20 px-1 py-0.5 rounded">context.hardware</code>
                                    <span className="text-gray-600 dark:text-gray-400">
                                        API do equipamento (pessoas, biometria, grupos/departamentos, config, comandos). O
                                        worker exige <code className="font-mono text-[10px]">equipmentId</code> (
                                        <code className="font-mono text-[10px]">EQPCodigo</code>) como{' '}
                                        <strong className="font-medium text-gray-700 dark:text-gray-300">primeiro</strong>{' '}
                                        argumento em cada método, exceto os institucionais (ex.:{' '}
                                        <code className="font-mono text-[10px]">deletePersonAcrossInstitution</code>).
                                    </span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <code className="text-blue-600 dark:text-blue-400 font-mono text-xs bg-blue-50 dark:bg-blue-900/20 px-1 py-0.5 rounded">context.adapters</code>
                                    <span className="text-gray-600 dark:text-gray-400">Adaptadores Legados</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <code className="text-green-600 dark:text-green-400 font-mono text-xs bg-green-50 dark:bg-green-900/20 px-1 py-0.5 rounded">logger</code>
                                    <span className="text-gray-600 dark:text-gray-400">Log em Arquivo (.txt diário)</span>
                                </li>
                            </ul>
                        </div>

                        <div className="rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-3">
                            <div>
                                <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-1">
                                    context.hardware — contrato do worker
                                </h4>
                                <p className="text-[11px] text-amber-950/80 dark:text-amber-100/80 leading-relaxed space-y-2">
                                    <span className="block">
                                        Cada método de equipamento (não institucional) é invocado como{' '}
                                        <code className="font-mono text-[10px] bg-white/70 dark:bg-black/30 px-1 rounded">
                                            await context.hardware.&lt;nome&gt;(equipmentId, …)
                                        </code>
                                        , onde <code className="font-mono text-[10px]">equipmentId</code> é obrigatório e
                                        corresponde ao <code className="font-mono text-[10px]">EQPCodigo</code> do
                                        cadastro de equipamento na instituição da rotina; o worker resolve o tenant e o
                                        provider.
                                    </span>
                                    <span className="block mt-2">
                                        <strong className="font-medium text-amber-950 dark:text-amber-50">Atenção:</strong>{' '}
                                        não confunda com o id da pessoa no leitor (
                                        <code className="font-mono text-[10px]">PESIdExterno</code>, mapeamento, etc.).
                                        Esse valor entra <em>depois</em> do{' '}
                                        <code className="font-mono text-[10px]">equipmentId</code> (ex.:{' '}
                                        <code className="font-mono text-[10px]">setGroups(eqpId, userId, [1])</code>).
                                    </span>
                                    <span className="block mt-2">
                                        Métodos institucionais na lista abaixo{' '}
                                        <strong>não</strong> recebem <code className="font-mono text-[10px]">eqpId</code>{' '}
                                        na chamada. Equipamentos com addon exigem relay (
                                        <code className="font-mono text-[10px]">WEBAPI_WS_URL</code>,{' '}
                                        <code className="font-mono text-[10px]">RELAY_INTERNAL_TOKEN</code>
                                        ) no processo do worker.
                                    </span>
                                </p>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {HARDWARE_REFERENCE.map((row) => (
                                    <div
                                        key={row.method}
                                        className="text-[11px] border-b border-amber-200/50 dark:border-amber-900/30 pb-2 last:border-0 last:pb-0"
                                    >
                                        <div className="font-mono text-amber-900 dark:text-amber-100">
                                            {row.method}
                                            <span className="text-gray-600 dark:text-gray-400 font-sans">
                                                {' '}
                                                {row.institutional
                                                    ? `(${row.params})`
                                                    : `(eqpId, ${row.params})`}
                                            </span>
                                        </div>
                                        {row.notes && (
                                            <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 italic">
                                                {row.notes}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div>
                                <h5 className="text-[10px] font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide mb-2">
                                    Exemplos (inserir)
                                </h5>
                                <div className="space-y-2">
                                    {HARDWARE_INSERT_EXAMPLES.map((ex, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => onInsertSnippet(ex.code)}
                                            className="w-full text-left p-2 rounded-md bg-white/80 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 border border-amber-200/60 dark:border-amber-900/40 transition-colors group"
                                        >
                                            <div className="flex justify-between items-start gap-2 mb-0.5">
                                                <span className="font-medium text-gray-800 dark:text-gray-200 text-xs group-hover:text-amber-700 dark:group-hover:text-amber-300">
                                                    {ex.label}
                                                </span>
                                                <span className="text-[10px] text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 shrink-0">
                                                    + Inserir
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-500 line-clamp-2">
                                                {ex.detail}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Snippets Comuns</h4>
                            </div>

                            {/* Search Input */}
                            <div className="relative mb-3">
                                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                    <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar snippet..."
                                    className="block w-full pl-7 pr-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-xs"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                {SNIPPETS.filter(s =>
                                    s.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    s.detail.toLowerCase().includes(searchTerm.toLowerCase())
                                ).map((snippet, idx) => (
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
                                {SNIPPETS.filter(s =>
                                    s.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    s.detail.toLowerCase().includes(searchTerm.toLowerCase())
                                ).length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-4 italic">Nenhum snippet encontrado.</p>
                                    )}
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
