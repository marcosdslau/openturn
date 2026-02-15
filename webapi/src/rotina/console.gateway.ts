import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*', // TODO: Configurar CORS adequadamente em produção
    },
    namespace: '/console',
})
export class ConsoleGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ConsoleGateway.name);
    private activeConnections = new Map<string, Set<string>>(); // rotinaCodigo -> Set<socketId>

    handleConnection(client: Socket) {
        this.logger.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);

        // Remove client de todas as salas
        this.activeConnections.forEach((clients, room) => {
            clients.delete(client.id);
            if (clients.size === 0) {
                this.activeConnections.delete(room);
            }
        });
    }

    /**
     * Cliente se inscreve para receber logs de uma rotina específica
     */
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

    /**
     * Cliente cancela inscrição
     */
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

    /**
     * Envia log para todos os clientes inscritos em uma rotina
     */
    sendLog(rotinaCodigo: number, log: {
        level: 'log' | 'info' | 'warn' | 'error';
        message: string;
        timestamp: string;
    }) {
        const room = `rotina-${rotinaCodigo}`;
        this.server.to(room).emit('log', log);
    }

    /**
     * Notifica início de execução
     */
    sendExecutionStart(rotinaCodigo: number, executionId: string) {
        const room = `rotina-${rotinaCodigo}`;
        this.server.to(room).emit('execution:start', {
            executionId,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Notifica fim de execução
     */
    sendExecutionEnd(rotinaCodigo: number, executionId: string, result: {
        success: boolean;
        duration: number;
        error?: string;
    }) {
        const room = `rotina-${rotinaCodigo}`;
        this.server.to(room).emit('execution:end', {
            executionId,
            ...result,
            timestamp: new Date().toISOString(),
        });
    }

    /**
     * Retorna número de clientes conectados a uma sala
     */
    getActiveClientsCount(rotinaCodigo: number): number {
        const room = `rotina-${rotinaCodigo}`;
        return this.activeConnections.get(room)?.size || 0;
    }
}
