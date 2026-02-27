import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { verify } from 'jsonwebtoken';
import { ConnectorService } from './connector.service';
import {
    WsMessage,
    HttpRequestMessage,
    HttpResponseStartMessage,
    HttpResponseChunkMessage,
    HttpResponseEndMessage,
    HttpResponseErrorMessage,
} from './ws-protocol.types';
import { randomUUID } from 'crypto';

interface ConnectorConnection {
    ws: WebSocket;
    connectorId: number;
    instituicaoCodigo: number;
    clienteCodigo: number;
    lastPing: number;
}

interface PendingRequest {
    resolve: (response: ResolvedResponse) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    chunks: string[];
    statusCode?: number;
    headers?: Record<string, string>;
}

interface ResolvedResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: Buffer;
}

@Injectable()
export class WsRelayGateway implements OnModuleInit, OnModuleDestroy {
    private server: Server;
    private readonly logger = new Logger(WsRelayGateway.name);
    private connections = new Map<number, ConnectorConnection>();
    private pendingRequests = new Map<string, PendingRequest>();
    private internalClients = new Set<WebSocket>();
    private requestOrigin = new Map<string, WebSocket>(); // requestId → internal WS that sent it
    private heartbeatInterval: ReturnType<typeof setInterval>;

    constructor(private connectorService: ConnectorService) { }

    onModuleInit() {
        this.server = new Server({ port: 8001, path: '/ws/connectors' });

        this.server.on('connection', (client, request) => {
            this.handleConnection(client, request);
        });

        this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30_000);
        this.logger.log('WS Relay Gateway initialized manually on port 8001 (ws://0.0.0.0:8001/ws/connectors)');
    }

    async handleConnection(client: WebSocket, request: any) {
        try {
            const headers = request?.headers || {};

            // ——— Internal service connection (e.g. remote-ui-gateway) ———
            const internalService = headers['x-internal-service'];
            if (internalService) {
                const internalToken = headers['x-internal-token'] || '';
                const expectedToken = process.env.RELAY_INTERNAL_TOKEN || '';

                if (expectedToken && internalToken !== expectedToken) {
                    this.logger.warn(`Internal service "${internalService}" rejected: invalid token`);
                    client.close(4010, 'Invalid internal token');
                    return;
                }

                this.logger.log(`Internal service connected: ${internalService}`);
                this.internalClients.add(client);

                client.on('message', (data: Buffer) => {
                    try {
                        const msg: WsMessage = JSON.parse(data.toString());
                        if (msg.type === 'HTTP_REQUEST') {
                            this.routeGatewayRequest(client, msg);
                        }
                    } catch (err: any) {
                        this.logger.error(`Failed to parse internal message: ${err.message}`);
                    }
                });

                client.on('close', () => {
                    this.internalClients.delete(client);
                    this.logger.log(`Internal service disconnected: ${internalService}`);
                });
                return;
            }

            // ——— Connector connection (JWT auth) ———
            const authHeader = headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                this.logger.warn('Connection rejected: missing authorization');
                client.close(4001, 'Missing authorization header');
                return;
            }

            const token = authHeader.slice(7);
            const secret = process.env.JWT_SECRET || 'openturn-connector-secret';
            const payload = verify(token, secret) as any;

            if (payload.type !== 'connector') {
                client.close(4002, 'Invalid token type');
                return;
            }

            const connectorId = parseInt(payload.sub.split(':')[1], 10);
            const connector = await this.connectorService.findByInstituicao(payload.instituicaoCodigo);

            if (connector.CONCodigo !== connectorId) {
                client.close(4003, 'Token mismatch');
                return;
            }

            const connection: ConnectorConnection = {
                ws: client,
                connectorId: connector.CONCodigo,
                instituicaoCodigo: payload.instituicaoCodigo,
                clienteCodigo: payload.clienteCodigo,
                lastPing: Date.now(),
            };

            this.connections.set(connector.CONCodigo, connection);
            await this.connectorService.updateHeartbeat(connector.CONCodigo);

            this.logger.log(
                `Connector ${connector.CONCodigo} (${connector.CONNome}) connected — inst=${payload.instituicaoCodigo}`,
            );

            client.on('message', (data: Buffer) => {
                this.handleMessage(connection, data);
            });

            client.on('close', () => {
                this.handleDisconnect(client);
            });
        } catch (err) {
            this.logger.warn(`Connection rejected: ${err.message}`);
            client.close(4004, 'Authentication failed');
        }
    }

    async handleDisconnect(client: WebSocket) {
        for (const [id, conn] of this.connections.entries()) {
            if (conn.ws === client) {
                this.connections.delete(id);
                await this.connectorService.setOffline(id);
                this.logger.log(`Connector ${id} disconnected`);
                break;
            }
        }
    }

    private handleMessage(connection: ConnectorConnection, raw: Buffer) {
        try {
            const msg: WsMessage = JSON.parse(raw.toString());
            connection.lastPing = Date.now();

            switch (msg.type) {
                case 'PONG':
                    this.connectorService.updateHeartbeat(connection.connectorId);
                    break;

                case 'HTTP_RESPONSE_START':
                    this.handleResponseStart(msg);
                    break;

                case 'HTTP_RESPONSE_CHUNK':
                    this.handleResponseChunk(msg);
                    break;

                case 'HTTP_RESPONSE_END':
                    this.handleResponseEnd(msg);
                    break;

                case 'HTTP_RESPONSE_ERROR':
                    this.handleResponseError(msg);
                    break;

                default:
                    this.logger.warn(`Unknown message type: ${(msg as any).type}`);
            }
        } catch (err) {
            this.logger.error(`Failed to parse WS message: ${err.message}`);
        }
    }

    async sendHttpRequest(
        connectorId: number,
        equipId: number,
        baseUrl: string,
        method: string,
        path: string,
        headers: Record<string, string> = {},
        body: string | null = null,
        timeoutMs = 15_000,
    ): Promise<ResolvedResponse> {
        const connection = this.connections.get(connectorId);
        if (!connection) {
            throw new Error('Connector not connected');
        }

        const requestId = randomUUID();
        const request: HttpRequestMessage = {
            type: 'HTTP_REQUEST',
            requestId,
            tenantId: connection.instituicaoCodigo,
            equipId,
            target: { baseUrl, method, path, headers, body },
            timeoutMs,
        };

        return new Promise<ResolvedResponse>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pendingRequests.set(requestId, { resolve, reject, timer, chunks: [] });
            connection.ws.send(JSON.stringify(request));
        });
    }

    /**
     * Route an HTTP_REQUEST from an internal service (gateway) to the target connector.
     * Finds the connector by tenantId and forwards the message.
     */
    private routeGatewayRequest(sender: WebSocket, msg: any) {
        const tenantId = msg.tenantId;
        // Find connector for this tenant
        let targetConn: ConnectorConnection | undefined;
        for (const conn of this.connections.values()) {
            if (conn.instituicaoCodigo === tenantId) {
                targetConn = conn;
                break;
            }
        }

        if (!targetConn) {
            // Send error back to the internal client
            sender.send(JSON.stringify({
                type: 'HTTP_RESPONSE_ERROR',
                requestId: msg.requestId,
                error: 'Connector not connected for this tenant',
            }));
            return;
        }

        // Remember who sent the request so we can route the response back
        this.requestOrigin.set(msg.requestId, sender);

        targetConn.ws.send(JSON.stringify(msg));
    }

    isConnectorOnline(connectorId: number): boolean {
        return this.connections.has(connectorId);
    }

    private handleResponseStart(msg: HttpResponseStartMessage) {
        // Forward to internal client if it originated the request
        const origin = this.requestOrigin.get(msg.requestId);
        if (origin && origin.readyState === WebSocket.OPEN) {
            origin.send(JSON.stringify(msg));
            return;
        }

        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending) return;
        pending.statusCode = msg.statusCode;
        pending.headers = msg.headers;
    }

    private handleResponseChunk(msg: HttpResponseChunkMessage) {
        const origin = this.requestOrigin.get(msg.requestId);
        if (origin && origin.readyState === WebSocket.OPEN) {
            origin.send(JSON.stringify(msg));
            return;
        }

        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending) return;
        pending.chunks.push(msg.data);
    }

    private handleResponseEnd(msg: HttpResponseEndMessage) {
        const origin = this.requestOrigin.get(msg.requestId);
        if (origin && origin.readyState === WebSocket.OPEN) {
            origin.send(JSON.stringify(msg));
            this.requestOrigin.delete(msg.requestId);
            return;
        }

        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);

        const body = Buffer.concat(pending.chunks.map((c) => Buffer.from(c, 'base64')));
        pending.resolve({
            statusCode: pending.statusCode ?? 200,
            headers: pending.headers ?? {},
            body,
        });
    }

    private handleResponseError(msg: HttpResponseErrorMessage) {
        const origin = this.requestOrigin.get(msg.requestId);
        if (origin && origin.readyState === WebSocket.OPEN) {
            origin.send(JSON.stringify(msg));
            this.requestOrigin.delete(msg.requestId);
            return;
        }

        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending) return;

        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        pending.reject(new Error(msg.error));
    }

    private checkHeartbeats() {
        const now = Date.now();
        const staleThreshold = 90_000; // 90 seconds

        for (const [id, conn] of this.connections.entries()) {
            if (now - conn.lastPing > staleThreshold) {
                this.logger.warn(`Connector ${id} stale — disconnecting`);
                conn.ws.close(4005, 'Heartbeat timeout');
                this.connections.delete(id);
                this.connectorService.setOffline(id);
            } else {
                conn.ws.send(JSON.stringify({ type: 'PING', ts: now }));
            }
        }
    }

    onModuleDestroy() {
        clearInterval(this.heartbeatInterval);
        if (this.server) {
            this.server.close();
        }
    }
}
