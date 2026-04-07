import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { GLOBAL_RETRY_QUEUE, JOBS_DLX_QUEUE } from './rabbit-connection';

export interface RabbitOverviewDto {
    queues: number;
    messages_ready: number;
    messages_unacknowledged: number;
    publish_rate: number;
    deliver_rate: number;
    /** Total de mensagens na fila `q.rotina.dlq`. */
    dlq_messages: number;
    /** Total de mensagens na fila `q.rotina.retry`. */
    retry_queue_messages: number;
    timestamp: string;
}

/** Métricas de uma única fila (Management API). Taxas podem ser 0 se o broker não expuser `message_stats`. */
export interface RabbitQueueDetailDto {
    queue_name: string;
    messages_ready: number;
    messages_unacknowledged: number;
    messages_total: number;
    publish_rate: number;
    deliver_rate: number;
    timestamp: string;
}

@Injectable()
export class RabbitManagementService {
    private readonly logger = new Logger(RabbitManagementService.name);

    private get config() {
        return {
            url: process.env.RABBIT_MGMT_URL || 'http://localhost:15672',
            auth: {
                username: process.env.RABBIT_MGMT_USER || 'guest',
                password: process.env.RABBIT_MGMT_PASS || 'guest',
            },
        };
    }

    async getOverview(): Promise<RabbitOverviewDto> {
        try {
            const { url, auth } = this.config;
            
            const [overviewRes, queuesRes] = await Promise.all([
                axios.get(`${url}/api/overview`, { auth }),
                axios.get(`${url}/api/queues`, { auth }),
            ]);

            const overview = overviewRes.data;
            const queues = queuesRes.data;

            // Somar totais de todas as filas
            let messagesReady = 0;
            let messagesUnacked = 0;
            
            if (Array.isArray(queues)) {
                for (const q of queues) {
                    messagesReady += q.messages_ready || 0;
                    messagesUnacked += q.messages_unacknowledged || 0;
                }
            }

            const queueTotalMessages = (q: { messages?: number; messages_ready?: number; messages_unacknowledged?: number }) =>
                q.messages ?? (q.messages_ready || 0) + (q.messages_unacknowledged || 0);

            const findQueueDepth = (name: string): number => {
                if (!Array.isArray(queues)) return 0;
                const q = queues.find((x: { name?: string }) => x.name === name);
                return q ? queueTotalMessages(q) : 0;
            };

            return {
                queues: Array.isArray(queues) ? queues.length : 0,
                messages_ready: messagesReady,
                messages_unacknowledged: messagesUnacked,
                publish_rate: overview.message_stats?.publish_details?.rate || 0,
                deliver_rate: overview.message_stats?.deliver_details?.rate || 0,
                dlq_messages: findQueueDepth(JOBS_DLX_QUEUE),
                retry_queue_messages: findQueueDepth(GLOBAL_RETRY_QUEUE),
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Erro ao buscar overview do RabbitMQ: ${error.message}`);
            throw error;
        }
    }

    /**
     * Detalhes de uma fila pelo nome. Se a fila não existir, retorna zeros (não lança).
     */
    async getQueueDetail(queueName: string): Promise<RabbitQueueDetailDto> {
        const empty = (): RabbitQueueDetailDto => ({
            queue_name: queueName,
            messages_ready: 0,
            messages_unacknowledged: 0,
            messages_total: 0,
            publish_rate: 0,
            deliver_rate: 0,
            timestamp: new Date().toISOString(),
        });
        try {
            const { url, auth } = this.config;
            const [overviewRes, queuesRes] = await Promise.all([
                axios.get(`${url}/api/overview`, { auth }),
                axios.get(`${url}/api/queues`, { auth }),
            ]);
            const overview = overviewRes.data;
            const queues = queuesRes.data;
            if (!Array.isArray(queues)) return empty();
            const q = queues.find((x: { name?: string }) => x.name === queueName);
            if (!q) return empty();

            const ready = q.messages_ready ?? 0;
            const unacked = q.messages_unacknowledged ?? 0;
            const total =
                typeof q.messages === 'number' ? q.messages : ready + unacked;
            const ms = q.message_stats || {};
            const publish_rate =
                    ms.publish_details?.rate ??
                    ms.publish?.rate ??
                    overview.message_stats?.publish_details?.rate ??
                    0;
            const deliver_rate =
                    ms.deliver_get_details?.rate ??
                    ms.deliver_details?.rate ??
                    overview.message_stats?.deliver_details?.rate ??
                    0;

            return {
                queue_name: queueName,
                messages_ready: ready,
                messages_unacknowledged: unacked,
                messages_total: total,
                publish_rate,
                deliver_rate,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Erro ao buscar fila RabbitMQ ${queueName}: ${error.message}`);
            throw error;
        }
    }
}
