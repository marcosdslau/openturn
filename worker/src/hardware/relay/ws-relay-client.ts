import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type {
  HttpResponseStartMessage,
  HttpResponseChunkMessage,
  HttpResponseEndMessage,
  HttpResponseErrorMessage,
} from './ws-relay-protocol.types';
import { workerLogLine } from '../../worker-log';

export interface ResolvedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
}

type Pending = {
  resolve: (r: ResolvedResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  chunks: string[];
  statusCode?: number;
  headers?: Record<string, string>;
};

/**
 * Cliente WebSocket “interno” para o mesmo path dos connectors, autenticado
 * com x-internal-service + x-internal-token, conforme
 * [webapi/connector/ws-relay.gateway.ts](webapi) (branch internal service).
 */
export class WsRelayClient {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private connectPromise: Promise<void> | null = null;

  constructor(
    private readonly url: string,
    private readonly internalToken: string,
    private readonly serviceName: string = 'openturn-worker',
  ) {}

  /** Inicia a conexão (idempotente). */
  start(): void {
    if (this.closed) return;
    void this.connectOnce().catch((err) => {
      console.error(
        workerLogLine('WsRelay initial connect failed:'),
        err?.message || err,
      );
      this.scheduleConnect(2_000);
    });
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('WsRelayClient stopped'));
    }
    this.pending.clear();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private scheduleConnect(delayMs: number) {
    if (this.closed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectOnce().catch((err) => {
        console.error(workerLogLine('WsRelay connect error:'), err?.message || err);
        this.scheduleConnect(Math.min(30_000, 2000 * (1 + this.pending.size)));
      });
    }, delayMs);
  }

  private connectOnce(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('closed'));
    if (this.connectPromise) return this.connectPromise;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        const headers: Record<string, string> = {
          'x-internal-service': this.serviceName,
        };
        if (this.internalToken) {
          headers['x-internal-token'] = this.internalToken;
        }
        const socket = new WebSocket(this.url, { headers });
        this.ws = socket;

        socket.on('open', () => {
          console.log(workerLogLine(`WsRelay connected to ${this.url}`));
          this.connectPromise = null;
          resolve();
        });

        socket.on('message', (data: WebSocket.Data) => {
          this.onRawMessage(data);
        });

        socket.on('error', (err) => {
          this.connectPromise = null;
          reject(err);
        });

        socket.on('close', () => {
          this.ws = null;
          this.connectPromise = null;
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error('WebSocket to relay closed'));
          }
          this.pending.clear();
          if (!this.closed) {
            this.scheduleConnect(2_000);
          }
        });
      } catch (e) {
        this.connectPromise = null;
        reject(e);
      }
    });

    return this.connectPromise;
  }

  private ensureConnected(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();
    this.start();
    return this.connectOnce();
  }

  private onRawMessage(data: WebSocket.Data) {
    let msg: any;
    try {
      msg = JSON.parse(
        typeof data === 'string' ? data : data.toString('utf-8'),
      );
    } catch {
      return;
    }

    if (msg.type === 'PING') {
      this.ws?.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
      return;
    }

    if (msg.type === 'PONG') return;

    if (msg.type === 'HTTP_RESPONSE_ERROR') {
      const m = msg as HttpResponseErrorMessage;
      const pending = this.pending.get(m.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(m.requestId);
        pending.reject(new Error(m.error));
      }
      return;
    }

    if (msg.type === 'HTTP_RESPONSE_START') {
      const m = msg as HttpResponseStartMessage;
      const pending = this.pending.get(m.requestId);
      if (pending) {
        pending.statusCode = m.statusCode;
        pending.headers = m.headers;
      }
      return;
    }

    if (msg.type === 'HTTP_RESPONSE_CHUNK') {
      const m = msg as HttpResponseChunkMessage;
      const pending = this.pending.get(m.requestId);
      if (pending) {
        pending.chunks.push(m.data);
      }
      return;
    }

    if (msg.type === 'HTTP_RESPONSE_END') {
      const m = msg as HttpResponseEndMessage;
      const pending = this.pending.get(m.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(m.requestId);

      const body = Buffer.concat(
        pending.chunks.map((c) => Buffer.from(c, 'base64')),
      );
      pending.resolve({
        statusCode: pending.statusCode ?? 200,
        headers: pending.headers ?? {},
        body,
      });
    }
  }

  /**
   * Mesma semântica do `WsRelayGateway.sendHttpRequest` (primeiro parâmetro no gateway
   * é `connectorId`; no cliente interno usamos `tenantId` no corpo, como o gateway monta
   * a partir da conexão do connector).
   */
  async sendHttpRequest(
    tenantId: number,
    equipId: number,
    baseUrl: string,
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body: string | null = null,
    timeoutMs = 15_000,
  ): Promise<ResolvedResponse> {
    await this.ensureConnected();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket relay not connected');
    }

    const requestId = randomUUID();
    return new Promise<ResolvedResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        chunks: [],
      });

      const payload = {
        type: 'HTTP_REQUEST' as const,
        requestId,
        tenantId,
        equipId,
        target: { baseUrl, method, path, headers, body },
        timeoutMs,
      };

      this.ws!.send(JSON.stringify(payload));
    });
  }
}
