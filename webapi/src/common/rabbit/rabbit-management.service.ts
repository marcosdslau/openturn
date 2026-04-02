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
}
