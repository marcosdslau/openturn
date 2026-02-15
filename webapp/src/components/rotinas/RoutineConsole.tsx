import { useEffect, useState, useRef } from "react";
import { useSocket } from "@/hooks/use-socket";

interface LogEntry {
    level: "log" | "info" | "warn" | "error";
    message: string;
    timestamp: string;
}

interface RoutineConsoleProps {
    rotinaCodigo: number;
}

export default function RoutineConsole({ rotinaCodigo }: RoutineConsoleProps) {
    const { socket, isConnected } = useSocket("/console");
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!socket) return;

        // Join room
        socket.emit("subscribe", { rotinaCodigo });

        // Listeners
        socket.on("log", (log: LogEntry) => {
            setLogs((prev) => [...prev, log]);
        });

        socket.on("execution:start", (data) => {
            setLogs((prev) => [...prev, { level: "info", message: `🚀 Execução iniciada [${data.executionId}]`, timestamp: data.timestamp }]);
        });

        socket.on("execution:end", (data) => {
            const msg = data.success
                ? `✅ Execução finalizada em ${data.duration}ms`
                : `❌ Falha na execução: ${data.error} (${data.duration}ms)`;

            setLogs((prev) => [...prev, {
                level: data.success ? "info" : "error",
                message: msg,
                timestamp: data.timestamp
            }]);
        });

        return () => {
            socket.emit("unsubscribe", { rotinaCodigo });
            socket.off("log");
            socket.off("execution:start");
            socket.off("execution:end");
        };
    }, [socket, rotinaCodigo]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const clearLogs = () => setLogs([]);

    return (
        <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="text-xs font-mono text-gray-400">Live Console</span>
                </div>
                <button onClick={clearLogs} className="text-xs text-gray-400 hover:text-white">
                    Limpar
                </button>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1"
            >
                {logs.length === 0 && (
                    <div className="text-gray-600 italic text-center mt-10">Aguardando logs...</div>
                )}

                {logs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                        <span className="text-gray-500 shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={
                            log.level === "error" ? "text-red-400" :
                                log.level === "warn" ? "text-yellow-400" :
                                    log.level === "info" ? "text-blue-400" :
                                        "text-gray-300"
                        }>
                            [{log.level.toUpperCase()}]
                        </span>
                        <span className="text-gray-100 break-all whitespace-pre-wrap">
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
