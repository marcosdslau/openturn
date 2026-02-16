import * as React from 'react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
    BoxIcon as SearchIcon,
    TrashBinIcon,
    RefreshIcon,
    ArrowDownIcon,
    ListIcon as FilterIcon,
    CloseIcon
} from '@/icons';
import { RotinaService } from '@/services/rotina.service';
import Tooltip from '@/components/ui/tooltip/Tooltip';

interface ConsolePanelProps {
    rotinaCodigo: number;
    instituicaoCodigo: number;
    height?: string;
}

interface LogMessage {
    level: 'log' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
}

interface ExecutionStartMessage {
    executionId: string;
    timestamp: string;
}

interface ExecutionEndMessage {
    executionId: string;
    success: boolean;
    duration: number;
    error?: string;
    timestamp: string;
}

type ConsoleEntry =
    | { type: 'log'; data: LogMessage; isHistorical?: boolean }
    | { type: 'start'; data: ExecutionStartMessage; isHistorical?: boolean }
    | { type: 'end'; data: ExecutionEndMessage; isHistorical?: boolean };

export function ConsolePanel({ rotinaCodigo, instituicaoCodigo, height = '300px' }: ConsolePanelProps) {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [search, setSearch] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [connected, setConnected] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);

    // Advanced Filters
    const [showFilters, setShowFilters] = useState(false);
    const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
    const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});

    // WebSocket Status for UI
    const [wsStatus, setWsStatus] = useState<'online' | 'history'>('online');

    const scrollRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);

    // Derived state to check if any filter is active
    const hasActiveFilters = search.length > 0 || selectedLevels.length > 0 || dateRange.start || dateRange.end;

    // WebSocket logic
    useEffect(() => {
        const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';
        const socket = io(`${baseUrl}/console`, {
            transports: ['websocket'],
            autoConnect: false // Manage connection manually
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setConnected(true);
            socket.emit('subscribe', { rotinaCodigo });
        });

        socket.on('disconnect', () => {
            setConnected(false);
        });

        socket.on('log', (data: LogMessage) => {
            setEntries((prev) => [...prev, { type: 'log', data }]);
        });

        socket.on('execution:start', (data: ExecutionStartMessage) => {
            setEntries((prev) => [...prev, { type: 'start', data }]);
            // Also reset active filters if a new execution starts? Maybe not.
        });

        socket.on('execution:end', (data: ExecutionEndMessage) => {
            setEntries((prev) => [...prev, { type: 'end', data }]);
        });

        // Initial connection if not in history mode
        if (wsStatus === 'online') {
            socket.connect();
        }

        return () => {
            if (socket) {
                socket.emit('unsubscribe', { rotinaCodigo });
                socket.disconnect();
            }
        };
    }, [rotinaCodigo, wsStatus]);

    // Effect to toggle WebSocket based on filters
    useEffect(() => {
        if (hasActiveFilters) {
            setWsStatus('history');
            if (socketRef.current?.connected) {
                socketRef.current.disconnect();
            }
            loadHistoricalLogs();
        } else {
            setWsStatus('online');
            if (socketRef.current && !socketRef.current.connected) {
                socketRef.current.connect();
            }
            // Clear entries to show live logs cleanly
            setEntries([]);
        }
    }, [hasActiveFilters]);

    const loadHistoricalLogs = useCallback(async () => {
        setIsSearching(true);
        try {
            const data = await RotinaService.getLogs(
                rotinaCodigo,
                instituicaoCodigo,
                search,
                selectedLevels,
                dateRange.start,
                dateRange.end
            );

            // Transform backend logs to ConsoleEntry
            if (!data || !Array.isArray(data)) {
                setEntries([]);
                return;
            }

            const historical = data.flatMap((exec: any) => {
                const startEntry: ConsoleEntry = {
                    type: 'start',
                    isHistorical: true,
                    data: {
                        executionId: exec.EXECodigo.toString(),
                        timestamp: exec.EXEInicio
                    }
                };

                let logs: ConsoleEntry[] = [];
                if (exec.EXELogs && Array.isArray(exec.EXELogs)) {
                    logs = exec.EXELogs.map((l: any) => ({
                        type: 'log',
                        isHistorical: true,
                        data: {
                            level: l.level || 'info',
                            message: l.message,
                            timestamp: l.timestamp || exec.EXEInicio
                        }
                    }));
                }

                const endEntry: ConsoleEntry = {
                    type: 'end',
                    isHistorical: true,
                    data: {
                        executionId: exec.EXECodigo.toString(),
                        success: exec.EXEStatus === 'SUCESSO',
                        duration: exec.EXEDuracaoMs || 0,
                        error: exec.EXEErro,
                        timestamp: exec.EXEFim || new Date().toISOString()
                    }
                };

                return [startEntry, ...logs, endEntry];
            }).sort((a, b) => {
                // Sort by timestamp
                const timeA = new Date(a.type === 'log' ? a.data.timestamp : a.data.timestamp).getTime();
                const timeB = new Date(b.type === 'log' ? b.data.timestamp : b.data.timestamp).getTime();
                return timeA - timeB;
            });

            setEntries(historical);
            // Don't auto-scroll for historical search results, let user browse
            setAutoScroll(false);
            if (scrollRef.current) {
                scrollRef.current.scrollTop = 0;
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
            setEntries([]);
        } finally {
            setIsSearching(false);
        }
    }, [rotinaCodigo, instituicaoCodigo, search, selectedLevels, dateRange]);

    const toggleLevel = (level: string) => {
        setSelectedLevels(prev =>
            prev.includes(level)
                ? prev.filter(l => l !== level)
                : [...prev, level]
        );
    };

    const clearFilters = () => {
        setSearch('');
        setSelectedLevels([]);
        setDateRange({});
        setShowFilters(false);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        loadHistoricalLogs();
    };

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries, autoScroll]);

    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const isAtBottom = scrollHeight - scrollTop >= clientHeight - 10;
            setAutoScroll(isAtBottom);
        }
    };

    const clearConsole = () => {
        setEntries([]);
        // If searching, clearing console might strictly mean clearing view, 
        // but often users expect to reset to "live" if they "clear" everything.
        // For now, just clear the entries list.
        if (wsStatus === 'history') {
            // Optional: clearFilters(); 
        }
    };

    return (
        <div className="flex flex-col bg-[#1e1e1e] border-t border-gray-800" style={{ height }}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#252526] border-b border-black">
                <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest select-none">Console</span>
                        <Tooltip content={connected ? 'Conectado' : 'Desconectado'} placement="bottom">
                            <div className={`w-1.5 h-1.5 rounded-full cursor-help ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        </Tooltip>
                    </div>

                    {/* Search Bar */}
                    <form onSubmit={handleSearch} className="flex-1 max-w-sm flex items-center bg-[#1e1e1e] border border-gray-700/50 rounded overflow-hidden px-2 py-0.5 focus-within:border-blue-500 transition-colors">
                        <input
                            type="text"
                            placeholder="Pesquisar nos logs históricos..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-transparent border-none text-xs text-gray-300 w-full focus:ring-0 placeholder:text-gray-600 h-6 outline-none"
                        />
                        {isSearching ? (
                            <RefreshIcon className="w-[15px] h-[15px] text-gray-500 animate-spin" />
                        ) : (
                            <Tooltip content="Pesquisar" placement="bottom">
                                <button type="submit" className="text-gray-500 hover:text-white transition-colors">
                                    <SearchIcon className="w-[15px] h-[15px]" />
                                </button>
                            </Tooltip>
                        )}
                    </form>

                    <Tooltip content="Filtros Avançados" placement="bottom">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-1 rounded transition-colors ${showFilters || hasActiveFilters ? 'text-blue-400 bg-white/10' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <FilterIcon className="w-[15px] h-[15px]" />
                        </button>
                    </Tooltip>
                </div>

                <div className="flex items-center gap-1 ml-2">
                    <Tooltip content="Carregar logs recentes" placement="bottom">
                        <button
                            onClick={() => loadHistoricalLogs()}
                            className="p-1.5 rounded text-gray-500 hover:text-blue-400 hover:bg-white/5 transition-all"
                        >
                            <RefreshIcon className={`w-[15px] h-[15px] ${isSearching ? 'animate-spin text-blue-400' : ''}`} />
                        </button>
                    </Tooltip>
                    <Tooltip content="Rolagem Automática" placement="bottom">
                        <button
                            onClick={() => setAutoScroll(true)}
                            className={`p-1.5 rounded hover:bg-white/5 transition-all ${autoScroll ? 'text-blue-400' : 'text-gray-500'}`}
                        >
                            <ArrowDownIcon className="w-[15px] h-[15px]" />
                        </button>
                    </Tooltip>
                    <div className="w-px h-4 bg-gray-800 mx-1"></div>
                    <Tooltip content="Limpar Console" placement="bottom">
                        <button
                            onClick={clearConsole}
                            className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-red-400 transition-all"
                        >
                            <TrashBinIcon className="w-[15px] h-[15px]" />
                        </button>
                    </Tooltip>
                </div>
            </div>

            {/* Filters Bar */}
            {(showFilters || hasActiveFilters) && (
                <div className="border-b border-gray-800 bg-[#252526] p-2">
                    <div className="flex flex-wrap items-center gap-4">

                        {/* Status Indicator */}
                        <div className={`flex items-center gap-2 rounded-full px-2 py-0.5 text-[10px] font-medium border ${wsStatus === 'online'
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-gray-700/50 text-gray-300 border-gray-600'
                            }`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${wsStatus === 'online' ? 'animate-pulse bg-green-500' : 'bg-gray-400'}`} />
                            {wsStatus === 'online' ? 'TRANSMISSÃO AO VIVO' : 'HISTÓRICO'}
                        </div>

                        <div className="h-3 w-px bg-gray-700" />

                        {/* Level Filters */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-gray-500">Níveis:</span>
                            {['info', 'warn', 'error'].map(level => (
                                <button
                                    key={level}
                                    onClick={() => toggleLevel(level)}
                                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors border ${selectedLevels.includes(level)
                                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                        : 'bg-transparent text-gray-500 hover:text-gray-300 border-gray-700 hover:border-gray-600'
                                        }`}
                                >
                                    {level.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        <div className="h-3 w-px bg-gray-700" />

                        {/* Date Filter */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-gray-500">Período:</span>
                            <div className="flex items-center gap-1">
                                <div className="relative">
                                    <input
                                        type="date"
                                        className="h-5 rounded bg-[#1e1e1e] border border-gray-700 px-1 text-[10px] text-gray-300 focus:border-blue-500 outline-none"
                                        value={dateRange.start || ''}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    />
                                </div>
                                <span className="text-gray-600 text-[10px]">até</span>
                                <div className="relative">
                                    <input
                                        type="date"
                                        className="h-5 rounded bg-[#1e1e1e] border border-gray-700 px-1 text-[10px] text-gray-300 focus:border-blue-500 outline-none"
                                        value={dateRange.end || ''}
                                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Clear Filters */}
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="ml-auto text-[10px] text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"
                            >
                                <CloseIcon className="w-[15px] h-[15px]" />
                                Limpar
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Logs List */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed selection:bg-blue-500/30"
                style={{ scrollBehavior: 'smooth' }}
            >
                {entries.length === 0 && !isSearching && wsStatus === 'online' && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2 opacity-50">
                        <div className="text-xs italic">Aguardando logs em tempo real...</div>
                    </div>
                )}

                {entries.length === 0 && !isSearching && wsStatus === 'history' && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2 opacity-50">
                        <div className="text-xs italic">Nenhum log encontrado para os filtros selecionados.</div>
                    </div>
                )}

                {isSearching && entries.length === 0 && (
                    <div className="flex justify-center p-4">
                        <RefreshIcon className="w-[15px] h-[15px] text-blue-500 animate-spin" />
                    </div>
                )}

                {entries.map((entry, idx) => {
                    const isHistorical = entry.isHistorical;

                    if (entry.type === 'start') {
                        return (
                            <div key={idx} className="text-blue-400/80 border-t border-blue-900/20 pt-2 mt-4 flex items-center gap-2">
                                <span className="opacity-50">➤</span>
                                <span className="font-bold">Execução iniciada</span>
                                <span className="text-[10px] bg-blue-900/30 px-2 py-0.5 rounded text-blue-300">ID: {entry.data.executionId}</span>
                                <span className="text-gray-600 ml-auto">{new Date(entry.data.timestamp).toLocaleString()}</span>
                            </div>
                        );
                    }

                    if (entry.type === 'end') {
                        return (
                            <div key={idx} className={`pb-2 mb-4 border-b border-gray-800/50 flex flex-col gap-1 ${entry.data.success ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                <div className="flex items-center gap-2">
                                    <span>{entry.data.success ? '✔' : '✘'}</span>
                                    <span>Execução finalizada em <strong className="text-white">{entry.data.duration}ms</strong></span>
                                </div>
                                {entry.data.error && (
                                    <div className="bg-red-900/10 border-l-2 border-red-500/50 p-2 ml-4 mt-1 text-red-300 whitespace-pre-wrap">
                                        {entry.data.error}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    // Log Entry
                    const { level, message, timestamp } = entry.data;
                    let colorClass = 'text-gray-300';
                    let levelLabel = '';

                    if (level === 'info') colorClass = 'text-blue-300';
                    if (level === 'warn') {
                        colorClass = 'text-yellow-300/90';
                        levelLabel = '[WARN] ';
                    }
                    if (level === 'error') {
                        colorClass = 'text-red-400';
                        levelLabel = '[ERROR] ';
                    }

                    return (
                        <div key={idx} className={`flex gap-3 hover:bg-white/5 py-0.5 px-1 -mx-1 rounded transition-colors group ${isHistorical ? 'opacity-90 border-l border-gray-700/30' : ''}`}>
                            <span className="text-gray-600 shrink-0 select-none w-16 text-[10px] group-hover:text-gray-400">{new Date(timestamp).toLocaleTimeString()}</span>
                            <span className={`${colorClass} whitespace-pre-wrap break-all flex-1`}>
                                <span className="opacity-50 font-bold">{levelLabel}</span>
                                {message}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
