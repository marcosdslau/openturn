import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { configService } from './config-service';
import { WsMessage, PingMessage, PongMessage } from '../types/protocol';

export type OnMessageCallback = (message: WsMessage) => void;

export class WssClient {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 50;
    private onMessageCallback: OnMessageCallback | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    constructor(private onMessage: OnMessageCallback) {
        this.onMessageCallback = onMessage;
    }

    connect() {
        const config = configService.load();
        if (!config.relayUrl || !config.token) {
            logger.error('Missing relayUrl or token in config. Run "pair" first.');
            return;
        }

        logger.info(`Connecting to Relay: ${config.relayUrl}`);

        this.ws = new WebSocket(config.relayUrl, {
            headers: {
                Authorization: `Bearer ${config.token}`,
            },
        });

        this.ws.on('open', () => {
            logger.info('Connected to Relay Gateway');
            this.reconnectAttempts = 0;
            this.startHeartbeat();
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString()) as WsMessage;

                if (message.type === 'PING') {
                    this.send({ type: 'PONG', ts: Date.now() } as PongMessage);
                    return;
                }

                if (message.type === 'PONG') {
                    // Heartbeat received back
                    return;
                }

                this.onMessageCallback?.(message);
            } catch (error) {
                logger.error('Failed to parse message from Relay', error);
            }
        });

        this.ws.on('close', (code, reason) => {
            logger.warn(`Connection closed (code: ${code}, reason: ${reason})`);
            this.stopHeartbeat();
            this.reconnect();
        });

        this.ws.on('error', (error) => {
            logger.error('WebSocket error', error);
        });
    }

    private reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnect attempts reached. Stopping.');
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;

        logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.connect(), delay);
    }

    private startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.send({ type: 'PING', ts: Date.now() } as PingMessage);
            }
        }, 30000);
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    send(message: WsMessage) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            logger.warn('Tried to send message but WS is not open', message.type);
        }
    }

    close() {
        this.ws?.close();
    }
}
