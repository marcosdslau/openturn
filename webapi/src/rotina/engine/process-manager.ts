import { Injectable, Logger } from '@nestjs/common';
import { fork, ChildProcess } from 'child_process';
import { join } from 'path';
import { ConsoleGateway } from '../console.gateway';
import { routineTimeoutSecondsFromCadastro } from './routine-timeout.util';

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

@Injectable()
export class ProcessManager {
  private readonly logger = new Logger(ProcessManager.name);
  private activeProcesses = new Map<
    string,
    { child: ChildProcess; rotinaCodigo: number }
  >();
  private consoleGateway: ConsoleGateway | null = null;

  setConsoleGateway(gateway: ConsoleGateway) {
    this.consoleGateway = gateway;
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

    if (this.consoleGateway) {
      this.consoleGateway.sendExecutionStart(rotinaCodigo, exeId);
    }

    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (result: ExecutionResult) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      const runnerPath = join(__dirname, 'routine-runner.js');

      // Sem `fork({ timeout })`: o timeout do Node usa SIGTERM e pode divergir do kill abaixo;
      // um único timer com SIGKILL respeita estritamente o cadastro (ROTTimeoutSeconds).
      const child = fork(runnerPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      this.activeProcesses.set(exeId, { child, rotinaCodigo });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        this.logger.warn(
          `Execution ${exeId} timed out after ${sec}s (cadastro)`,
        );

        const timeoutLog: LogEntry = {
          level: 'error',
          message: `⏱️ Timeout: Execução excedeu o limite de ${sec}s`,
          timestamp: new Date().toISOString(),
        };
        logs.push(timeoutLog);

        if (this.consoleGateway) {
          this.consoleGateway.sendLog(rotinaCodigo, timeoutLog, exeId);
        }

        child.kill('SIGKILL');
      }, timeoutMs);

      child.send({
        type: 'execute',
        code,
        context,
        dbConfig: rpcHandler ? context.dbConfig : undefined,
      });

      child.on('message', async (message: any) => {
        if (message.type === 'log') {
          const logEntry: LogEntry = {
            level: message.level,
            message: message.message,
            timestamp: message.timestamp,
          };
          logs.push(logEntry);

          if (this.consoleGateway) {
            this.consoleGateway.sendLog(rotinaCodigo, logEntry, exeId);
          }
          return;
        }

        if (message.type === 'rpc') {
          if (rpcHandler) {
            try {
              const result = await rpcHandler(message.method, message.params);
              child.send({ type: 'rpc:success', id: message.id, result });
            } catch (error: any) {
              child.send({
                type: 'rpc:error',
                id: message.id,
                error: error.message || String(error),
              });
            }
          } else {
            child.send({
              type: 'rpc:error',
              id: message.id,
              error: 'RPC Handler not configured',
            });
          }
          return;
        }

        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        if (message.type === 'success') {
          const executionResult: ExecutionResult = {
            success: true,
            result: message.result,
            duration,
            timedOut: false,
            logs,
          };

          if (this.consoleGateway) {
            this.consoleGateway.sendExecutionEnd(
              rotinaCodigo,
              exeId,
              executionResult,
            );
          }

          this.cleanup(exeId);
          safeResolve(executionResult);
        } else if (message.type === 'error') {
          const executionResult: ExecutionResult = {
            success: false,
            error: message.error,
            duration,
            timedOut: false,
            logs,
          };

          if (this.consoleGateway) {
            this.consoleGateway.sendExecutionEnd(
              rotinaCodigo,
              exeId,
              executionResult,
            );
          }

          this.cleanup(exeId);
          safeResolve(executionResult);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        this.logger.error(`Process error for ${exeId}:`, error);

        const result: ExecutionResult = {
          success: false,
          error: error.message,
          duration,
          timedOut,
          logs,
        };

        if (this.consoleGateway) {
          this.consoleGateway.sendExecutionEnd(rotinaCodigo, exeId, result);
        }

        this.cleanup(exeId);
        safeResolve(result);
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        if (code !== 0 && code !== null) {
          this.logger.warn(`Process ${exeId} exited with code ${code}`);

          const result: ExecutionResult = {
            success: false,
            error: `Process exited with code ${code}`,
            duration,
            timedOut,
            logs,
          };

          if (this.consoleGateway) {
            this.consoleGateway.sendExecutionEnd(rotinaCodigo, exeId, result);
          }

          this.cleanup(exeId);
          safeResolve(result);
        } else if (signal) {
          const cancelled = !timedOut && signal === 'SIGKILL';
          const result: ExecutionResult = {
            success: false,
            error: cancelled
              ? 'Execução cancelada pelo usuário'
              : `Process killed with signal ${signal}`,
            duration,
            timedOut: timedOut && signal === 'SIGKILL',
            cancelled,
            logs,
          };

          if (this.consoleGateway) {
            this.consoleGateway.sendExecutionEnd(rotinaCodigo, exeId, result);
          }

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

  isRunning(exeId: string): boolean {
    return this.activeProcesses.has(exeId);
  }

  getActiveForRotina(rotinaCodigo: number): string[] {
    const ids: string[] = [];
    for (const [exeId, entry] of this.activeProcesses) {
      if (entry.rotinaCodigo === rotinaCodigo) {
        ids.push(exeId);
      }
    }
    return ids;
  }

  getActiveCount(): number {
    return this.activeProcesses.size;
  }
}
