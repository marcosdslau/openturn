import { fork, ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { routineTimeoutSecondsFromCadastro } from './routine-timeout.util';
import { channelConsole } from '../redis-keys';
import { createRedisClient } from '../redis-connection';
import { workerLogLine } from '../worker-log';

/** Folga após o timeout do timer de execução antes de forçar o settle da Promise (watchdog absoluto). */
const WATCHDOG_GRACE_MS = 10_000;

export interface LogEntry {
    level: 'log' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
}

export interface ExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
    timedOut: boolean;
    logs: LogEntry[];
    cancelled?: boolean;
}

export class WorkerProcessManager {
    private activeProcesses = new Map<string, { child: ChildProcess; rotinaCodigo: number }>();
    private redisPub: Redis;

    constructor(redisOptions: RedisOptions) {
        this.redisPub = createRedisClient(redisOptions, 'process-manager-pub');
    }

    private publishLog(rotinaCodigo: number, exeId: string, log: LogEntry) {
        this.redisPub.publish(channelConsole(), JSON.stringify({
            type: 'log',
            rotinaCodigo,
            exeId,
            log,
        }));
    }

    private publishExecutionStart(rotinaCodigo: number, exeId: string) {
        this.redisPub.publish(channelConsole(), JSON.stringify({
            type: 'execution:start',
            rotinaCodigo,
            exeId,
            timestamp: new Date().toISOString(),
        }));
    }

    private publishExecutionEnd(rotinaCodigo: number, exeId: string, result: { success: boolean; duration: number; error?: string }) {
        this.redisPub.publish(channelConsole(), JSON.stringify({
            type: 'execution:end',
            rotinaCodigo,
            exeId,
            ...result,
            timestamp: new Date().toISOString(),
        }));
    }

    async executeInProcess(
        exeId: string,
        rotinaCodigo: number,
        code: string,
        context: any,
        timeoutSeconds: number = 30,
        rpcHandler?: (method: string, params: any) => Promise<any>,
    ): Promise<ExecutionResult> {
        const sec = routineTimeoutSecondsFromCadastro(timeoutSeconds);
        const timeoutMs = sec * 1000;
        const startTime = Date.now();
        let timedOut = false;
        const logs: LogEntry[] = [];

        this.publishExecutionStart(rotinaCodigo, exeId);

        return new Promise((resolve) => {
            let resolved = false;
            const safeResolve = (result: ExecutionResult) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeoutHandle);
                clearTimeout(watchdogHandle);
                resolve(result);
            };

            const jsPath = join(__dirname, 'routine-runner.js');
            const tsPath = join(__dirname, 'routine-runner.ts');
            const useTsNode = !existsSync(jsPath) && existsSync(tsPath);
            const runnerPath = useTsNode ? tsPath : jsPath;

            const child = fork(runnerPath, [], {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                ...(useTsNode ? { execArgv: ['-r', 'ts-node/register'] } : {}),
            });

            this.activeProcesses.set(exeId, { child, rotinaCodigo });

            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                const timeoutLog: LogEntry = {
                    level: 'error',
                    message: `⏱️ Timeout: Execução excedeu o limite de ${sec}s`,
                    timestamp: new Date().toISOString(),
                };
                logs.push(timeoutLog);
                this.publishLog(rotinaCodigo, exeId, timeoutLog);
                child.kill('SIGKILL');
            }, timeoutMs);

            // Watchdog absoluto: se nem 'exit' nem 'error' dispararem após o SIGKILL do timeout
            // (processo zumbi/kill ignorado), força o settle da Promise de qualquer forma. Sem
            // isso a entrega do RabbitMQ nunca recebe ack/nack e o broker fecha o canal após
            // `consumer_timeout` (406 PRECONDITION-FAILED).
            const watchdogHandle = setTimeout(() => {
                console.error(workerLogLine(
                    `Watchdog: job ${exeId} (rotina=${rotinaCodigo}) não resolveu após timeout+grace — forçando settle.`,
                ));
                const duration = Date.now() - startTime;
                const result: ExecutionResult = {
                    success: false,
                    error: 'Watchdog: processo não respondeu após o timeout (forçado)',
                    duration,
                    timedOut: true,
                    logs,
                };
                this.publishExecutionEnd(rotinaCodigo, exeId, result);
                this.cleanup(exeId);
                try {
                    child.kill('SIGKILL');
                } catch {
                    /* ignore */
                }
                safeResolve(result);
            }, timeoutMs + WATCHDOG_GRACE_MS);

            child.send({
                type: 'execute',
                code,
                context,
                dbConfig: rpcHandler ? (context as any).dbConfig : undefined,
            });

            child.on('message', async (message: any) => {
                if (message.type === 'log') {
                    const logEntry: LogEntry = {
                        level: message.level,
                        message: message.message,
                        timestamp: message.timestamp,
                    };
                    logs.push(logEntry);
                    this.publishLog(rotinaCodigo, exeId, logEntry);
                    return;
                }

                if (message.type === 'rpc') {
                    if (rpcHandler) {
                        try {
                            const result = await rpcHandler(message.method, message.params);
                            if (child.connected) {
                                child.send({ type: 'rpc:success', id: message.id, result });
                            }
                        } catch (error: any) {
                            if (child.connected) {
                                child.send({ type: 'rpc:error', id: message.id, error: error.message || String(error) });
                            }
                        }
                    } else {
                        if (child.connected) {
                            child.send({ type: 'rpc:error', id: message.id, error: 'RPC Handler not configured' });
                        }
                    }
                    return;
                }

                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;

                if (message.type === 'success') {
                    const executionResult: ExecutionResult = {
                        success: true, result: message.result, duration, timedOut: false, logs,
                    };
                    this.publishExecutionEnd(rotinaCodigo, exeId, executionResult);
                    this.cleanup(exeId);
                    safeResolve(executionResult);
                } else if (message.type === 'error') {
                    const executionResult: ExecutionResult = {
                        success: false, error: message.error, duration, timedOut: false, logs,
                    };
                    this.publishExecutionEnd(rotinaCodigo, exeId, executionResult);
                    this.cleanup(exeId);
                    safeResolve(executionResult);
                }
            });

            child.on('error', (error) => {
                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;
                const result: ExecutionResult = {
                    success: false, error: error.message, duration, timedOut, logs,
                };
                this.publishExecutionEnd(rotinaCodigo, exeId, result);
                this.cleanup(exeId);
                safeResolve(result);
            });

            child.on('exit', (code, signal) => {
                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;

                if (code !== 0 && code !== null) {
                    const result: ExecutionResult = {
                        success: false, error: `Process exited with code ${code}`, duration, timedOut, logs,
                    };
                    this.publishExecutionEnd(rotinaCodigo, exeId, result);
                    this.cleanup(exeId);
                    safeResolve(result);
                } else if (signal) {
                    const cancelled = !timedOut && signal === 'SIGKILL';
                    const result: ExecutionResult = {
                        success: false,
                        error: cancelled ? 'Execução cancelada pelo usuário' : `Process killed with signal ${signal}`,
                        duration,
                        timedOut: timedOut && signal === 'SIGKILL',
                        cancelled,
                        logs,
                    };
                    this.publishExecutionEnd(rotinaCodigo, exeId, result);
                    this.cleanup(exeId);
                    safeResolve(result);
                } else {
                    // code === 0, sem signal: processo saiu "limpo" mas sem ter mandado
                    // 'success'/'error' antes (ex.: process.exit() chamado fora do fluxo normal,
                    // ou uma race no IPC). Sem este ramo a Promise ficava pendurada para sempre
                    // (já sem timeoutHandle, que acabou de ser limpo acima) — a entrega do
                    // RabbitMQ nunca recebia ack/nack.
                    const result: ExecutionResult = {
                        success: false,
                        error: 'Processo encerrado (code 0) sem retornar resultado',
                        duration,
                        timedOut,
                        logs,
                    };
                    this.publishExecutionEnd(rotinaCodigo, exeId, result);
                    this.cleanup(exeId);
                    safeResolve(result);
                }
            });
        });
    }

    private cleanup(exeId: string) {
        const entry = this.activeProcesses.get(exeId);
        if (entry) {
            entry.child.removeAllListeners();
            this.activeProcesses.delete(exeId);
        }
    }

    killProcess(exeId: string): boolean {
        const entry = this.activeProcesses.get(exeId);
        if (entry) {
            entry.child.kill('SIGKILL');
            return true;
        }
        return false;
    }

    getActiveCount(): number {
        return this.activeProcesses.size;
    }
}
