import React, { useState, useRef, useEffect } from "react";
import Button from "@/components/ui/button/Button";
import { CloseIcon, PlayIcon, RefreshIcon } from "@/icons";

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
    codeReference?: string;
    onClearReference?: () => void;
}

export const AiChatSidebar: React.FC<AiChatSidebarProps> = ({
    rotinaCodigo,
    instituicaoCodigo,
    currentCode,
    onApplyCode,
    onSuggestCode,
    onClose,
    codeReference,
    onClearReference,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [pendingRef, setPendingRef] = useState<string>('');
    const [modelCodigo, setModelCodigo] = useState(3); // Default to GPT-4o-mini (based on seed)
    const chatBottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Handle code reference from CTRL+L
    useEffect(() => {
        if (codeReference && codeReference.trim()) {
            setPendingRef(codeReference);
            onClearReference?.();
            textareaRef.current?.focus();
        }
    }, [codeReference]);

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
        if ((!input.trim() && !pendingRef) || isStreaming) return;

        // Build the user message, prepending the referenced code if present
        let userMsg = '';
        if (pendingRef) {
            userMsg += `Referente ao trecho:\n\`\`\`javascript\n${pendingRef}\n\`\`\`\n\n`;
        }
        userMsg += input;

        setInput("");
        setPendingRef('');
        // Reset textarea height
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

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

            // Immediately show the thinking placeholder before starting the heavy request
            setIsThinking(true);
            setMessages(prev => [...prev, { role: "assistant", content: "" }]);

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
                            content: `O usuário está editando o seguinte código no editor principal:\n\n\`\`\`javascript\n${currentCode || '// Vazio'}\n\`\`\`\n\nAja como assistente para ajudar nesse contexto. Use as tools disponíveis para consultar o schema do banco e snippets de código quando necessário.`
                        },
                        ...newMessages.slice(-5)
                    ]
                })
            });

            if (!response.ok) {
                // Remove placeholder if failed
                setIsThinking(false);
                setMessages(prev => prev.slice(0, -1));
                throw new Error('Falha ao conectar com IA. Limite excedido ou sem permissão.');
            }

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
                                    if (isThinking) setIsThinking(false);
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
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-sm w-full flex-1">
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
                                        ) : msg.content === '' && isThinking && i === messages.length - 1 ? (
                                            <div className="flex items-center gap-2 py-1">
                                                <div className="flex gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                </div>
                                                <span className="text-xs text-gray-400 italic">Analisando contexto...</span>
                                            </div>
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
                                                                    <Button size="sm" variant="outline" className="text-xs h-6 px-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-colors" onClick={() => onSuggestCode(block.content)}>
                                                                        ✨ Revisar no Editor
                                                                    </Button>
                                                                )}
                                                                <Button size="sm" variant="outline" className="text-xs h-6 px-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-800 hover:text-white hover:border-gray-800 transition-colors" onClick={() => onApplyCode(block.content)}>
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
                    {/* Code Reference Badge */}
                    {pendingRef && (
                        <div className="mb-2 bg-gray-100 dark:bg-gray-800 rounded-lg p-2 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{'</>'} Código selecionado</span>
                                <button onClick={() => setPendingRef('')} className="text-gray-400 hover:text-red-500 transition-colors">
                                    <CloseIcon className="w-3 h-3" />
                                </button>
                            </div>
                            <pre className="text-[11px] text-gray-600 dark:text-gray-300 font-mono max-h-20 overflow-y-auto whitespace-pre-wrap">{pendingRef.length > 200 ? pendingRef.substring(0, 200) + '...' : pendingRef}</pre>
                        </div>
                    )}
                    <div className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl pr-1 pl-4 py-1 border border-transparent focus-within:border-blue-500 transition-colors">
                        <textarea
                            ref={textareaRef}
                            className="flex-1 bg-transparent text-sm py-2 outline-none text-gray-800 dark:text-white resize-none overflow-hidden leading-5"
                            placeholder="Como integrar o Webhook com ERP?"
                            value={input}
                            rows={1}
                            onChange={e => {
                                setInput(e.target.value);
                                // Auto-grow
                                const el = e.target;
                                el.style.height = 'auto';
                                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            disabled={isStreaming}
                        />
                        <button
                            onClick={handleSend}
                            disabled={isStreaming || (!input.trim() && !pendingRef)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 mb-0.5"
                        >
                            {isStreaming ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <PlayIcon className="w-3 h-3 ml-0.5" />}
                        </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-gray-400">Ctrl+L no editor para referenciar código</span>
                        <span className="text-[10px] text-gray-400">Shift+Enter para nova linha</span>
                    </div>
                </div>
            )}
        </div>
    );
};
