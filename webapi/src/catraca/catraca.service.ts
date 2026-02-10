import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CatracaService {
    private readonly logger = new Logger(CatracaService.name);

    constructor(private prisma: PrismaService) { }

    // Fila simples em memória para comandos push (Será substituída por DB/Redis no futuro)
    private commandQueue: Map<string, any[]> = new Map();

    /**
     * Adiciona um comando à fila de um equipamento (Modo Push)
     */
    async enqueueCommand(deviceId: string, command: any) {
        const queue = this.commandQueue.get(deviceId) || [];
        queue.push(command);
        this.commandQueue.set(deviceId, queue);
        this.logger.log(`Command enqueued for device ${deviceId}: ${command.endpoint}`);
    }

    /**
     * Consome o próximo comando da fila
     */
    getPendingCommand(deviceId: string) {
        const queue = this.commandQueue.get(deviceId) || [];
        const command = queue.shift();
        if (command) {
            this.commandQueue.set(deviceId, queue);
        }
        return command;
    }

    /**
     * Registra um log de acesso recebido do equipamento
     */
    async recordAccessLog(deviceId: string, eventData: any) {
        this.logger.log(`Recording access for device ${deviceId}`);
        // TODO: Salvar na tabela de logs (será criada nas próximas sprints)
    }
}
