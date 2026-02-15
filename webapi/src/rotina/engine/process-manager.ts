import { Injectable, Logger } from '@nestjs/common';
import { fork, ChildProcess } from 'child_process';
import { join } from 'path';
import { ConsoleGateway } from '../console.gateway';

export interface ExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
    timedOut: boolean;
}

@Injectable()
export class ProcessManager {
    private readonly logger = new Logger(ProcessManager.name);
    private activeProcesses = new Map<string, ChildProcess>();
    private consoleGateway: ConsoleGateway | null = null;

    /**
     * Define o gateway de console (injeção manual para evitar dependência circular)
     */
    setConsoleGateway(gateway: ConsoleGateway) {
        this.consoleGateway = gateway;
    }

    /**
     * Executa código JavaScript em um processo filho isolado
     */
    async executeInProcess(
        executionId: string,
        rotinaCodigo: number,
        code: string,
        context: any,
        timeoutSeconds: number = 30,
        rpcHandler?: (method: string, params: any) => Promise<any>,
    ): Promise<ExecutionResult> {
        const startTime = Date.now();
        let timedOut = false;

        // Notifica início via WebSocket
        if (this.consoleGateway) {
            this.consoleGateway.sendExecutionStart(rotinaCodigo, executionId);
        }

        return new Promise((resolve) => {
            // Caminho para o script runner
            const runnerPath = join(__dirname, 'routine-runner.js');

            // Cria processo filho
            const child = fork(runnerPath, [], {
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                timeout: timeoutSeconds * 1000,
            });

            this.activeProcesses.set(executionId, child);

            // Timeout handler
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                this.logger.warn(`Execution ${executionId} timed out after ${timeoutSeconds}s`);

                // Envia log de timeout via WebSocket
                if (this.consoleGateway) {
                    this.consoleGateway.sendLog(rotinaCodigo, {
                        level: 'error',
                        message: `⏱️ Timeout: Execução excedeu o limite de ${timeoutSeconds}s`,
                        timestamp: new Date().toISOString(),
                    });
                }

                child.kill('SIGKILL');
            }, timeoutSeconds * 1000);

            // Envia código e contexto para o processo filho
            // IMPORTANTE: context não deve conter objetos não serializáveis (como conexões DB)
            // Use dbConfig e rpcHandler para isso.
            child.send({
                type: 'execute',
                code,
                context,
                dbConfig: rpcHandler ? (context as any).dbConfig : undefined,
            });

            // Escuta mensagens do processo filho
            child.on('message', async (message: any) => {
                // Se for um log, transmite via WebSocket
                if (message.type === 'log' && this.consoleGateway) {
                    this.consoleGateway.sendLog(rotinaCodigo, {
                        level: message.level,
                        message: message.message,
                        timestamp: message.timestamp,
                    });
                    return; // Não resolve a promise
                }

                // Se for uma chamada RPC
                if (message.type === 'rpc') {
                    if (rpcHandler) {
                        try {
                            const result = await rpcHandler(message.method, message.params);
                            child.send({
                                type: 'rpc:success',
                                id: message.id,
                                result
                            });
                        } catch (error: any) {
                            child.send({
                                type: 'rpc:error',
                                id: message.id,
                                error: error.message || String(error)
                            });
                        }
                    } else {
                        child.send({
                            type: 'rpc:error',
                            id: message.id,
                            error: 'RPC Handler not configured'
                        });
                    }
                    return;
                }

                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;

                if (message.type === 'success') {
                    const result = {
                        success: true,
                        result: message.result,
                        duration,
                        timedOut: false,
                    };

                    // Notifica fim via WebSocket
                    if (this.consoleGateway) {
                        this.consoleGateway.sendExecutionEnd(rotinaCodigo, executionId, result);
                    }

                    resolve(result);
                } else if (message.type === 'error') {
                    const result = {
                        success: false,
                        error: message.error,
                        duration,
                        timedOut: false,
                    };

                    // Notifica fim via WebSocket
                    if (this.consoleGateway) {
                        this.consoleGateway.sendExecutionEnd(rotinaCodigo, executionId, result);
                    }

                    resolve(result);
                }

                this.cleanup(executionId);
            });

            // Erro no processo
            child.on('error', (error) => {
                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;

                this.logger.error(`Process error for ${executionId}:`, error);

                const result = {
                    success: false,
                    error: error.message,
                    duration,
                    timedOut,
                };

                // Notifica fim via WebSocket
                if (this.consoleGateway) {
                    this.consoleGateway.sendExecutionEnd(rotinaCodigo, executionId, result);
                }

                resolve(result);
                this.cleanup(executionId);
            });

            // Processo encerrado
            child.on('exit', (code, signal) => {
                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;

                if (code !== 0 && code !== null) {
                    this.logger.warn(`Process ${executionId} exited with code ${code}`);

                    const result = {
                        success: false,
                        error: `Process exited with code ${code}`,
                        duration,
                        timedOut,
                    };

                    if (this.consoleGateway) {
                        this.consoleGateway.sendExecutionEnd(rotinaCodigo, executionId, result);
                    }

                    resolve(result);
                } else if (signal) {
                    const result = {
                        success: false,
                        error: `Process killed with signal ${signal}`,
                        duration,
                        timedOut: signal === 'SIGKILL',
                    };

                    if (this.consoleGateway) {
                        this.consoleGateway.sendExecutionEnd(rotinaCodigo, executionId, result);
                    }

                    resolve(result);
                }

                this.cleanup(executionId);
            });
        });
    }

    /**
     * Limpa processo da lista de ativos
     */
    private cleanup(executionId: string) {
        const child = this.activeProcesses.get(executionId);
        if (child) {
            child.removeAllListeners();
            this.activeProcesses.delete(executionId);
        }
    }

    /**
     * Mata um processo específico
     */
    killProcess(executionId: string) {
        const child = this.activeProcesses.get(executionId);
        if (child) {
            child.kill('SIGKILL');
            this.cleanup(executionId);
        }
    }

    /**
     * Retorna número de processos ativos
     */
    getActiveCount(): number {
        return this.activeProcesses.size;
    }
}
