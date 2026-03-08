import React, { useState, useRef, useEffect } from "react";
import Button from "@/components/ui/button/Button";
import { CloseIcon, PlayIcon, RefreshIcon } from "@/icons";
import { ROUTINE_SCHEMA } from "./RoutineSchema";
import { ALL_SNIPPETS } from "./RoutineSnippets";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface AiChatSidebarProps {
    rotinaCodigo: number;
    instituicaoCodigo: number;
    currentCode: string;
    onApplyCode: (codeSnippet: string) => void;
    onSuggestCode?: (suggestedFullCode: string) => void;
    onClose?: () => void;
}

export const AiChatSidebar: React.FC<AiChatSidebarProps> = ({
    rotinaCodigo,
    instituicaoCodigo,
    currentCode,
    onApplyCode,
    onSuggestCode,
    onClose,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [modelCodigo, setModelCodigo] = useState(3); // Default to GPT-4o-mini (based on seed)
    const chatBottomRef = useRef<HTMLDivElement>(null);

    // History and Threads State
    const [threads, setThreads] = useState<any[]>([]);
    const [activeChatId, setActiveChatId] = useState<number | null>(null);
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Fetch available threads on mount
    useEffect(() => {
        const fetchThreads = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/instituicoes/${instituicaoCodigo}/ia/conversations/routine/${rotinaCodigo}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setThreads(data);
                    if (data.length > 0 && !activeChatId) {
                        // Auto-load latest thread
                        loadThread(data[0].AICCodigo);
                    }
                }
            } catch (e) {
                console.error("Erro ao carregar histórico", e);
            }
        };
        fetchThreads();
    }, [instituicaoCodigo, rotinaCodigo]);

    const loadThread = async (chatId: number) => {
        setLoadingHistory(true);
        setActiveChatId(chatId);
        setView('chat');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/instituicoes/${instituicaoCodigo}/ia/conversations/${chatId}/messages`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
            });
            if (res.ok) {
                const msgs = await res.json();
                setMessages(msgs.map((m: any) => ({ role: m.AIMSRole, content: m.AIMSContent })));
            }
        } catch (e) {
            console.error("Erro ao carregar mensagens da thread", e);
        } finally {
            setLoadingHistory(false);
        }
    };

    const startNewChat = () => {
        setActiveChatId(null);
        setMessages([]);
        setView('chat');
    };

    // Auto-scroll on new messages
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isStreaming) return;

        const userMsg = input;
        setInput("");

        // Optimistic user push
        const newMessages: ChatMessage[] = [
            ...messages,
            { role: "user", content: userMsg }
        ];
        setMessages(newMessages);
        setIsStreaming(true);

        try {
            let currentChatId = activeChatId;

            // If it's a new chat, explicitly create the thread first
            if (!currentChatId) {
                const createRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/instituicoes/${instituicaoCodigo}/ia/conversations/routine/${rotinaCodigo}/new`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                    },
                    body: JSON.stringify({ modelCodigo })
                });
                if (!createRes.ok) throw new Error('Falha ao criar nova conversa.');
                const newThread = await createRes.json();
                currentChatId = newThread.AICCodigo;
                setActiveChatId(currentChatId);

                // Add to threads list optimally
                setThreads(prev => [newThread, ...prev]);
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/instituicoes/${instituicaoCodigo}/ia/conversations/${currentChatId}/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Assuming Auth Token is handled by fetch interceptor generally, or supply here
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                },
                body: JSON.stringify({
                    modelCodigo,
                    messages: [
                        {
                            role: 'system',
                            content: `O usuário está editando o seguinte código no editor principal:\n\n\`\`\`javascript\n${currentCode || '// Vazio'}\n\`\`\`\n\nAja como assistente para ajudar nesse contexto.\n\n### CONTEXTO DISPONÍVEL\nO sistema possui acesso aos seguintes bancos e helpers. Use-os como base para suas respostas em código:\n\n#### Bancos e Tabelas (context.db):\n${ROUTINE_SCHEMA.map(t => `- Tabela/Modelo: ${t.name} (${t.description})\n  Campos: ${t.fields.map(f => `${f.name} (${f.type})`).join(', ')}`).join('\n')}\n\n#### Snippets Úteis de Referência (Prisma e Helpers):\n${ALL_SNIPPETS.map(s => `- ${s.label}: ${s.detail}\n\`\`\`js\n${s.code}\n\`\`\``).join('\n')}`
                        },
                        ...newMessages.slice(-5)
                    ]
                })
            });

            if (!response.ok) {
                throw new Error('Falha ao conectar com IA. Limite excedido ou sem permissão.');
            }

            // Add a placeholder for assistant
            setMessages(prev => [...prev, { role: "assistant", content: "" }]);

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                let assistantReply = "";

                // Manual simple SSE parser since native EventSource doesn't support POST bodies
                let buffer = "";
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split('\n\n');
                    // keep the last incomplete part in the buffer
                    buffer = parts.pop() || "";

                    for (const rawData of parts) {
                        if (rawData.startsWith("data: ")) {
                            const dataStr = rawData.slice(6);
                            try {
                                const parsed = JSON.parse(dataStr);
                                if (parsed.chunkText) {
                                    assistantReply += parsed.chunkText;
                                    setMessages(prev => {
                                        const clone = [...prev];
                                        clone[clone.length - 1].content = assistantReply;
                                        return clone;
                                    });
                                }
                            } catch (e) {
                                console.error("Failed to parse chunk", e);
                            }
                        } else if (rawData.startsWith("event: error")) {
                            console.error("Stream SSE Error received", rawData);
                        }
                    }
                }
            }

        } catch (err: any) {
            console.error(err);
            setMessages(prev => [...prev, { role: "assistant", content: `❌ Erro: ${err.message}` }]);
        } finally {
            setIsStreaming(false);
        }
    };

    const parseCodeBlocks = (text: string) => {
        // Splits by triple backticks
        const regex = /```(javascript|js|typescript|ts)?\n([\s\S]*?)```/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
            }
            parts.push({ type: 'code', content: match[2] });
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            parts.push({ type: 'text', content: text.slice(lastIndex) });
        }

        if (parts.length === 0) return [{ type: 'text', content: text }];
        return parts;
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-sm w-96 flex-shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-800">
                <div className="flex flex-col">
                    <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        ✨ Assistente de IA
                        <button
                            onClick={() => setView(view === 'chat' ? 'history' : 'chat')}
                            className="text-[10px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors cursor-pointer"
                        >
                            {view === 'chat' ? 'Ver Histórico' : 'Voltar ao Chat'}
                        </button>
                    </span>
                    <select
                        value={modelCodigo}
                        onChange={e => setModelCodigo(Number(e.target.value))}
                        className="text-xs bg-transparent text-gray-500 mt-1 outline-none cursor-pointer"
                    >
                        <option value={3}>GPT-4o-mini (Rápido)</option>
                        <option value={2}>GPT-4 Turbo (Avançado)</option>
                        <option value={1}>GPT-3.5 Turbo</option>
                    </select>
                </div>
                {onClose && (
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                        <CloseIcon className="w-4 h-4 text-gray-500" />
                    </button>
                )}
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50 text-sm flex flex-col">
                {view === 'history' ? (
                    <div className="p-4 flex-1">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Conversas Anteriores</h3>
                            <Button size="sm" variant="outline" onClick={startNewChat} className="text-xs h-7">
                                + Nova Thread
                            </Button>
                        </div>
                        {threads.length === 0 ? (
                            <p className="text-xs text-gray-500 text-center mt-10">Nenhum histórico encontrado.</p>
                        ) : (
                            <div className="space-y-2">
                                {threads.map(t => (
                                    <button
                                        key={t.AICCodigo}
                                        onClick={() => loadThread(t.AICCodigo)}
                                        className={`w-full text-left p-3 rounded-md border transition-all ${activeChatId === t.AICCodigo
                                            ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                            : 'bg-white border-gray-200 hover:border-blue-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-blue-700'
                                            }`}
                                    >
                                        <div className="font-medium text-gray-800 dark:text-gray-200 truncate pr-2">{t.AICTitulo}</div>
                                        <div className="text-[10px] text-gray-500 mt-1">
                                            {new Date(t.createdAt).toLocaleString('pt-BR')}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-4 space-y-4 flex-1">
                        {loadingHistory ? (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                <RefreshIcon className="w-5 h-5 animate-spin mr-2" /> Carregando mensagens...
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="text-center text-gray-400 mt-10">
                                <p className="mb-2">Descreva a lógica de integração que você precisa, ou cole um JSON para estruturar.</p>
                                <span className="text-xs bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded-full">Nova conversa selecionada</span>
                            </div>
                        ) : (
                            messages.map((msg, i) => (
                                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[90%] rounded-xl p-3 ${msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-br-none'
                                        : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 shadow-sm rounded-tl-none'
                                        }`}
                                    >
                                        {msg.role === 'user' ? (
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {parseCodeBlocks(msg.content).map((block, idx) => {
                                                    if (block.type === 'text') {
                                                        return <p key={idx} className="whitespace-pre-wrap">{block.content}</p>;
                                                    }
                                                    return (
                                                        <div key={idx} className="relative group mt-2 bg-gray-900 rounded-md overflow-hidden">
                                                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                                {onSuggestCode && (
                                                                    <Button size="sm" variant="outline" className="text-xs h-6 px-2 bg-emerald-700 text-white border-none hover:bg-emerald-600" onClick={() => onSuggestCode(block.content)}>
                                                                        ✨ Revisar no Editor
                                                                    </Button>
                                                                )}
                                                                <Button size="sm" variant="outline" className="text-xs h-6 px-2 bg-gray-800 text-white border-none hover:bg-gray-700" onClick={() => onApplyCode(block.content)}>
                                                                    Inserir
                                                                </Button>
                                                            </div>
                                                            <pre className="p-3 text-xs text-blue-300 overflow-x-auto">{block.content}</pre>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={chatBottomRef} />
                    </div>
                )}
            </div>

            {/* Input Box */}
            {view === 'chat' && (
                <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shrink-0">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full pr-1 pl-4 py-1 border border-transparent focus-within:border-blue-500 transition-colors">
                        <input
                            type="text"
                            className="flex-1 bg-transparent text-sm py-1 outline-none text-gray-800 dark:text-white"
                            placeholder="Como integrar o Webhook com ERP?"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            disabled={isStreaming}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isStreaming || !input.trim()}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        >
                            {isStreaming ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <PlayIcon className="w-3 h-3 ml-0.5" />}
                        </button>
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-gray-400">Contexto atual da rotina é enviado junto com sua pergunta.</span>
                    </div>
                </div>
            )}
        </div>
    );
};
