import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { subDays } from 'date-fns';

@Injectable()
export class LogCleanupService {
    private readonly logger = new Logger(LogCleanupService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Executa a limpeza de logs todos os dias às 03:00 da manhã
     */
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async handleCleanup() {
        this.logger.log('Iniciando rotina de limpeza automática de logs...');

        try {
            // Busca instituições que têm auto-exclusão ativa
            const instituicoes = await this.prisma.iNSInstituicao.findMany({
                where: {
                    INSLogsAutoExcluir: true,
                },
                select: {
                    INSCodigo: true,
                    INSNome: true,
                    INSLogsDiasRetencao: true,
                },
            });

            let totalDeleted = 0;

            for (const inst of instituicoes) {
                const dias = inst.INSLogsDiasRetencao || 90;
                const limite = subDays(new Date(), dias);

                const result = await this.prisma.rOTExecucaoLog.deleteMany({
                    where: {
                        INSInstituicaoCodigo: inst.INSCodigo,
                        EXEInicio: {
                            lt: limite,
                        },
                    },
                });

                if (result.count > 0) {
                    this.logger.log(`Limpeza: ${result.count} logs removidos da instituição ${inst.INSNome} (Retenção: ${dias} dias)`);
                    totalDeleted += result.count;
                }
            }

            this.logger.log(`Rotina de limpeza concluída. Total de logs removidos: ${totalDeleted}`);
        } catch (error) {
            this.logger.error('Erro ao executar rotina de limpeza de logs:', error);
        }
    }
}
