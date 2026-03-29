import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import { ProcessManager } from '../rotina/engine/process-manager';
import { StatusExecucao, TipoRotina } from '@prisma/client';

@Injectable()
export class MonitorService {
    private readonly logger = new Logger(MonitorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly rotinaQueueService: RotinaQueueService,
        private readonly processManager: ProcessManager,
    ) { }

    async getGlobalStats() {
        try {
            // Usamos o prisma diretamente (sem .rls) para contagens globais
            const [
                totalClientes,
                totalInstituicoes,
                totalPessoas,
                totalMatriculas,
                totalEquipamentos,
                totalRotinas,
                totalSchedules,
                totalWebhooks,
                totalExecucoes,
                execucoesHoje,
            ] = await Promise.all([
                this.prisma.cLICliente.count(),
                this.prisma.iNSInstituicao.count(),
                this.prisma.pESPessoa.count(),
                this.prisma.mATMatricula.count(),
                this.prisma.eQPEquipamento.count(),
                this.prisma.rOTRotina.count(),
                this.prisma.rOTRotina.count({ where: { ROTTipo: TipoRotina.SCHEDULE } }),
                this.prisma.rOTRotina.count({ where: { ROTTipo: TipoRotina.WEBHOOK } }),
                this.prisma.rOTExecucaoLog.count(),
                this.prisma.rOTExecucaoLog.count({
                    where: {
                        EXEInicio: {
                            gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        }
                    }
                }),
            ]);

            const queueCounts = await this.rotinaQueueService.getJobCounts();
            const runningNow = this.processManager.getActiveCount();

            return {
                counts: {
                    clientes: totalClientes,
                    instituicoes: totalInstituicoes,
                    pessoas: totalPessoas,
                    matriculas: totalMatriculas,
                    equipamentos: totalEquipamentos,
                    rotinas: {
                        total: totalRotinas,
                        schedules: totalSchedules,
                        webhooks: totalWebhooks,
                    },
                    execucoes: {
                        total: totalExecucoes,
                        hoje: execucoesHoje,
                    }
                },
                queue: {
                    ...queueCounts,
                    running: runningNow,
                },
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.logger.error('Error fetching global stats:', error);
            throw error;
        }
    }
}
