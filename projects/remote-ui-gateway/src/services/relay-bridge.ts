import WebSocket from 'ws';
import {
    rewriteLocationHeader,
    rewriteSetCookiePath,
    rewriteHtml,
} from './rewrite-engine';
import { buildToolbarHtml } from './toolbar';
import { ValidatedSession } from '../middleware/session-validator';

interface WsMessage {
    type: string;
    [key: string]: any;
}

interface ProxyResult {
    statusCode: number;
    headers: Record<string, string>;
    body: Buffer;
}

/**
 * Bridge to the WS Relay Gateway.
 * Sends HTTP_REQUEST messages via a WebSocket connection and collects the response.
 */
export class RelayBridge {
    private ws: WebSocket | null = null;
    private connected = false;
    private pendingRequests = new Map<string, {
        resolve: (result: ProxyResult) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
        statusCode?: number;
        headers?: Record<string, string>;
        chunks: string[];
    }>();

    constructor(private relayUrl: string) { }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.doConnect(resolve, reject);
        });
    }

    private doConnect(
        onFirstOpen?: (value: void) => void,
        onFirstError?: (error: Error) => void,
    ) {
        const internalToken = process.env.RELAY_INTERNAL_TOKEN || '';

        this.ws = new WebSocket(this.relayUrl, {
            headers: {
                'x-internal-service': 'remote-ui-gateway',
                'x-internal-token': internalToken,
            },
        });

        let settled = false;

        this.ws.on('open', () => {
            console.log(`[RelayBridge] Connected to Relay: ${this.relayUrl}`);
            this.connected = true;
            if (!settled && onFirstOpen) {
                settled = true;
                onFirstOpen();
            }
        });

        this.ws.on('message', (data: Buffer) => {
            try {
                const msg: WsMessage = JSON.parse(data.toString());
                this.handleMessage(msg);
            } catch { /* ignore parse errors */ }
        });

        this.ws.on('close', () => {
            this.connected = false;
            console.log('[RelayBridge] Connection closed, reconnecting in 3s...');
            setTimeout(() => this.doConnect(), 3000);
        });

        this.ws.on('error', (err) => {
            console.error('[RelayBridge] WS error:', err.message);
            if (!settled && onFirstError) {
                settled = true;
                onFirstError(err);
            }
            // Don't re-throw — the 'close' event will handle reconnect
        });
    }

    async sendHttpRequest(
        session: ValidatedSession,
        method: string,
        path: string,
        headers: Record<string, string>,
        body: string | null,
        timeoutMs = 60_000,
    ): Promise<ProxyResult> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to Relay');
        }

        const requestId = crypto.randomUUID();
        const config = session.equipamento.EQPConfig || {};

        // Resolve base URL: Priority 1: session explicit targetIp, then fallbacks
        let rawHost = session.targetIp
            || (config as any).host
            || (config as any).ip_entry
            || (config as any).ip_exit
            || session.equipamento.EQPEnderecoIp;

        if (!rawHost) {
            throw new Error('No target IP or fallback IP found for this equipment.');
        }

        // Ensure protocol prefix
        let baseUrl = rawHost;
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            baseUrl = `http://${baseUrl}`;
        }

        console.log(`[RelayBridge] [${requestId}] Resolved baseUrl: ${baseUrl} for session ${session.sessionId}`);

        const request: WsMessage = {
            type: 'HTTP_REQUEST',
            requestId,
            tenantId: session.equipamento.INSInstituicaoCodigo,
            equipId: session.equipamento.EQPCodigo,
            target: { baseUrl, method, path, headers, body },
            timeoutMs,
        };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pendingRequests.set(requestId, {
                resolve,
                reject,
                timer,
                chunks: [],
            });

            this.ws!.send(JSON.stringify(request));
        });
    }

    private handleMessage(msg: WsMessage) {
        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending) return;

        switch (msg.type) {
            case 'HTTP_RESPONSE_START':
                pending.statusCode = msg.statusCode;
                pending.headers = msg.headers;
                break;

            case 'HTTP_RESPONSE_CHUNK':
                pending.chunks.push(msg.data);
                break;

            case 'HTTP_RESPONSE_END':
                clearTimeout(pending.timer);
                this.pendingRequests.delete(msg.requestId);
                const body = Buffer.concat(
                    pending.chunks.map((c) => Buffer.from(c, 'base64')),
                );
                pending.resolve({
                    statusCode: pending.statusCode ?? 200,
                    headers: pending.headers ?? {},
                    body,
                });
                break;

            case 'HTTP_RESPONSE_ERROR':
                clearTimeout(pending.timer);
                this.pendingRequests.delete(msg.requestId);
                pending.reject(new Error(msg.error));
                break;
        }
    }

    close() {
        this.ws?.close();
    }
}

/**
 * Apply rewrites to the proxied response before sending to the browser.
 */
export function applyRewrites(
    statusCode: number,
    headers: Record<string, string>,
    body: Buffer,
    sessionPrefix: string,
    sessionId: string,
    downstreamPath: string,
): { statusCode: number; headers: Record<string, string>; body: Buffer } {
    const rewrittenHeaders = { ...headers };

    // Rewrite Location header
    if (rewrittenHeaders['location']) {
        rewrittenHeaders['location'] = rewriteLocationHeader(
            rewrittenHeaders['location'],
            sessionPrefix,
        );
    }

    // Rewrite Set-Cookie Path
    if (rewrittenHeaders['set-cookie']) {
        rewrittenHeaders['set-cookie'] = rewriteSetCookiePath(
            rewrittenHeaders['set-cookie'],
            sessionPrefix,
        );
    }

    // Inject <base href> and toolbar into HTML responses
    const contentType = (rewrittenHeaders['content-type'] || '').toLowerCase();
    let rewrittenBody = body;

    if (contentType.includes('text/html')) {
        const html = body.toString('utf-8');
        const toolbarHtml = buildToolbarHtml(sessionId);
        const rewrittenHtml = rewriteHtml(html, sessionPrefix, toolbarHtml, downstreamPath);
        rewrittenBody = Buffer.from(rewrittenHtml, 'utf-8');

        // Update content-length after rewrite
        rewrittenHeaders['content-length'] = String(rewrittenBody.length);
    }

    // Remove content-encoding to avoid issues (we're rewriting the body)
    delete rewrittenHeaders['content-encoding'];
    delete rewrittenHeaders['transfer-encoding'];

    return {
        statusCode,
        headers: rewrittenHeaders,
        body: rewrittenBody,
    };
}
