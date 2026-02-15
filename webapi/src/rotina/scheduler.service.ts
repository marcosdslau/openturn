import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExecutionService } from './engine/execution.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly schedulerRegistry: SchedulerRegistry,
        private readonly prisma: PrismaService,
        private readonly executionService: ExecutionService,
    ) { }

    async onModuleInit() {
        this.logger.log('Inicializando agendador de rotinas...');
        await this.loadActiveRoutines();
    }

    /**
     * Carrega todas as rotinas ativas e agenda seus cron jobs
     */
    async loadActiveRoutines() {
        try {
            const rotinas = await this.prisma.rOTRotina.findMany({
                where: {
                    ROTAtivo: true,
                    ROTCronExpressao: { not: null },
                },
            });

            this.logger.log(`Encontradas ${rotinas.length} rotinas ativas para agendamento.`);

            for (const rotina of rotinas) {
                if (rotina.ROTCronExpressao) {
                    this.addCronJob(
                        rotina.ROTCodigo,
                        rotina.ROTCronExpressao,
                        rotina.INSInstituicaoCodigo,
                        rotina.ROTNome
                    );
                }
            }
        } catch (error) {
            this.logger.error('Erro ao carregar rotinas:', error);
        }
    }

    /**
     * Adiciona ou substitui um Cron Job para uma rotina
     */
    addCronJob(rotinaId: number, cronExpression: string, instituicaoCodigo: number, nome: string) {
        const jobName = `rotina-${rotinaId}`;

        // Remove se já existir
        this.removeCronJob(rotinaId);

        try {
            const job = new CronJob(cronExpression, async () => {
                this.logger.log(`Executando rotina agendada: ${nome} (${rotinaId})`);
                try {
                    await this.executionService.execute(
                        rotinaId,
                        instituicaoCodigo,
                        'SCHEDULE',
                        { scheduled: true }
                    );
                } catch (err) {
                    this.logger.error(`Erro na execução agendada da rotina ${rotinaId}:`, err);
                }
            });

            this.schedulerRegistry.addCronJob(jobName, job);
            job.start();

            this.logger.log(`Rotina ${rotinaId} agendada: ${cronExpression}`);
        } catch (error: any) {
            this.logger.error(`Erro ao agendar rotina ${rotinaId}: ${error.message}`);
        }
    }

    /**
     * Remove um Cron Job existente
     */
    removeCronJob(rotinaId: number) {
        const jobName = `rotina-${rotinaId}`;
        try {
            const job = this.schedulerRegistry.getCronJob(jobName);
            if (job) {
                job.stop();
                this.schedulerRegistry.deleteCronJob(jobName);
                this.logger.log(`Agendamento removido para rotina ${rotinaId}`);
            }
        } catch (e) {
            // Ignora erro se job não existir
        }
    }
}
