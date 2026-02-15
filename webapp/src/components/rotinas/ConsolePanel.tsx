import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { TrashBinIcon, ArrowDownIcon } from '@/icons';

interface ConsolePanelProps {
    rotinaCodigo: number;
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
    | { type: 'log'; data: LogMessage }
    | { type: 'start'; data: ExecutionStartMessage }
    | { type: 'end'; data: ExecutionEndMessage };

export function ConsolePanel({ rotinaCodigo, height = '300px' }: ConsolePanelProps) {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [connected, setConnected] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Connect to WebSocket
        const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';
        const socket = io(`${baseUrl}/console`, {
            transports: ['websocket'],
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setConnected(true);
            console.log('Connected to console gateway');
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
            // Auto-clear on new execution? Maybe optional.
        });

        socket.on('execution:end', (data: ExecutionEndMessage) => {
            setEntries((prev) => [...prev, { type: 'end', data }]);
        });

        return () => {
            socket.emit('unsubscribe', { rotinaCodigo });
            socket.disconnect();
        };
    }, [rotinaCodigo]);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries, autoScroll]);

    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const isAtBottom = scrollHeight - scrollTop === clientHeight;
            setAutoScroll(isAtBottom);
        }
    };

    const clearConsole = () => {
        setEntries([]);
    };

    return (
        <div className="flex flex-col bg-[#1e1e1e] border-t border-gray-800" style={{ height }}>
            <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-black">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Console</span>
                    <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} title={connected ? 'Connected' : 'Disconnected'}></span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoScroll(true)}
                        className={`p-1 rounded hover:bg-white/10 ${autoScroll ? 'text-blue-400' : 'text-gray-500'}`}
                        title="Auto-scroll"
                    >
                        <ArrowDownIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={clearConsole}
                        className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-red-400"
                        title="Clear Console"
                    >
                        <TrashBinIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1"
            >
                {entries.length === 0 && (
                    <div className="text-gray-600 italic">Waiting for logs...</div>
                )}

                {entries.map((entry, idx) => {
                    if (entry.type === 'start') {
                        return (
                            <div key={idx} className="text-blue-400 border-t border-blue-900/30 pt-2 mt-2">
                                ➤ Execution started ({entry.data.executionId}) at {new Date(entry.data.timestamp).toLocaleTimeString()}
                            </div>
                        );
                    }
                    if (entry.type === 'end') {
                        return (
                            <div key={idx} className={`pb-2 mb-2 border-b border-gray-800 ${entry.data.success ? 'text-green-400' : 'text-red-400'}`}>
                                {entry.data.success ? '✔' : '✘'} Execution finished in {entry.data.duration}ms
                                {entry.data.error && <div className="text-red-300 ml-4 mt-1">{entry.data.error}</div>}
                            </div>
                        );
                    }
                    // Log
                    const { level, message, timestamp } = entry.data;
                    let colorClass = 'text-gray-300';
                    if (level === 'info') colorClass = 'text-blue-300';
                    if (level === 'warn') colorClass = 'text-yellow-300';
                    if (level === 'error') colorClass = 'text-red-400';

                    return (
                        <div key={idx} className="flex gap-2 hover:bg-white/5 px-1 -mx-1 rounded">
                            <span className="text-gray-600 shrink-0 select-none">{new Date(timestamp).toLocaleTimeString()}</span>
                            <span className={`${colorClass} whitespace-pre-wrap break-all`}>{message}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
