import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

@WebSocketGateway({
    cors: {
        origin: '*', // TODO: Configurar CORS adequadamente em produção
    },
    namespace: '/console',
})
export class ConsoleGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ConsoleGateway.name);
    private activeConnections = new Map<string, Set<string>>();
    private redisSub: Redis | null = null;

    afterInit(server: Server) {
        const redisHost = process.env.REDIS_HOST || 'localhost';
        const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

        try {
            const pubClient = new Redis({ host: redisHost, port: redisPort, lazyConnect: true });
            const subClient = pubClient.duplicate();

            Promise.all([pubClient.connect(), subClient.connect()])
                .then(() => {
                    server.adapter(createAdapter(pubClient, subClient) as any);
                    this.logger.log('Socket.IO Redis adapter configured');
                })
                .catch(() => {
                    this.logger.warn('Redis not available — Socket.IO running without adapter (single instance only)');
                });

            this.setupWorkerBridge(redisHost, redisPort);
        } catch {
            this.logger.warn('Redis adapter setup skipped');
        }
    }

    private setupWorkerBridge(host: string, port: number) {
        try {
            this.redisSub = new Redis({ host, port, lazyConnect: true });
            this.redisSub.connect().then(() => {
                this.redisSub!.subscribe('rotina:console');
                this.redisSub!.on('message', (_channel: string, message: string) => {
                    try {
                        const data = JSON.parse(message);
                        const room = `rotina-${data.rotinaCodigo}`;

                        if (data.type === 'log') {
                            this.server.to(room).emit('log', { ...data.log, exeId: data.exeId });
                        } else if (data.type === 'execution:start') {
                            this.server.to(room).emit('execution:start', {
                                exeId: data.exeId,
                                timestamp: data.timestamp,
                            });
                        } else if (data.type === 'execution:end') {
                            this.server.to(room).emit('execution:end', {
                                exeId: data.exeId,
                                success: data.success,
                                duration: data.duration,
                                error: data.error,
                                timestamp: data.timestamp,
                            });
                        }
                    } catch { /* ignore malformed messages */ }
                });
                this.logger.log('Worker console bridge established via Redis pub/sub');
            }).catch(() => {
                this.logger.warn('Redis sub for worker bridge not available');
            });
        } catch {
            this.logger.warn('Worker bridge setup skipped');
        }
    }

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);

        this.activeConnections.forEach((clients, room) => {
            clients.delete(client.id);
            if (clients.size === 0) {
                this.activeConnections.delete(room);
            }
        });
    }

    @SubscribeMessage('subscribe')
    handleSubscribe(client: Socket, payload: { rotinaCodigo: number }) {
        const room = `rotina-${payload.rotinaCodigo}`;

        client.join(room);

        if (!this.activeConnections.has(room)) {
            this.activeConnections.set(room, new Set());
        }
        this.activeConnections.get(room)!.add(client.id);

        this.logger.log(`Client ${client.id} subscribed to ${room}`);
        client.emit('subscribed', { room, rotinaCodigo: payload.rotinaCodigo });
    }

    @SubscribeMessage('unsubscribe')
    handleUnsubscribe(client: Socket, payload: { rotinaCodigo: number }) {
        const room = `rotina-${payload.rotinaCodigo}`;

        client.leave(room);

        const clients = this.activeConnections.get(room);
        if (clients) {
            clients.delete(client.id);
            if (clients.size === 0) {
                this.activeConnections.delete(room);
            }
        }

        this.logger.log(`Client ${client.id} unsubscribed from ${room}`);
        client.emit('unsubscribed', { room, rotinaCodigo: payload.rotinaCodigo });
    }

    sendLog(rotinaCodigo: number, log: {
        level: 'log' | 'info' | 'warn' | 'error';
        message: string;
        timestamp: string;
    }, exeId?: string) {
        const room = `rotina-${rotinaCodigo}`;
        this.server.to(room).emit('log', { ...log, exeId });
    }

    sendExecutionStart(rotinaCodigo: number, exeId: string) {
        const room = `rotina-${rotinaCodigo}`;
        this.server.to(room).emit('execution:start', {
            exeId,
            timestamp: new Date().toISOString(),
        });
    }

    sendExecutionEnd(rotinaCodigo: number, exeId: string, result: {
        success: boolean;
        duration: number;
        error?: string;
    }) {
        const room = `rotina-${rotinaCodigo}`;
        this.server.to(room).emit('execution:end', {
            exeId,
            ...result,
            timestamp: new Date().toISOString(),
        });
    }

    getActiveClientsCount(rotinaCodigo: number): number {
        const room = `rotina-${rotinaCodigo}`;
        return this.activeConnections.get(room)?.size || 0;
    }
}
