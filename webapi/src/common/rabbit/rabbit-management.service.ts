import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface RabbitOverviewDto {
    queues: number;
    messages_ready: number;
    messages_unacknowledged: number;
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

            return {
                queues: Array.isArray(queues) ? queues.length : 0,
                messages_ready: messagesReady,
                messages_unacknowledged: messagesUnacked,
                publish_rate: overview.message_stats?.publish_details?.rate || 0,
                deliver_rate: overview.message_stats?.deliver_details?.rate || 0,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error(`Erro ao buscar overview do RabbitMQ: ${error.message}`);
            throw error;
        }
    }
}
