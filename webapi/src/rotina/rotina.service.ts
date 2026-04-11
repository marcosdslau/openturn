import { Injectable, Logger, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExecutionService } from './engine/execution.service';
import { ProcessManager } from './engine/process-manager';
import { RotinaQueueService } from './queue/rotina-queue.service';
import { SchedulerService } from './scheduler.service';
import { TipoRotina, HttpMetodo, WebhookTokenSource, StatusExecucao } from '@prisma/client';
import { clampRotinaTimeoutForPersist } from './engine/routine-timeout.util';

@Injectable()
export class RotinaService {
    private readonly logger = new Logger(RotinaService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly executionService: ExecutionService,
        private readonly processManager: ProcessManager,
        private readonly rotinaQueueService: RotinaQueueService,
        private readonly schedulerService: SchedulerService,
    ) { }

    async findAll(instituicaoCodigo: number) {
        return this.prisma.rOTRotina.findMany({
            where: { INSInstituicaoCodigo: instituicaoCodigo },
            include: {
                criador: {
                    select: {
                        USRCodigo: true,
                        USRNome: true,
                        USREmail: true,
                    },
                },
                _count: {
                    select: {
                        execucoes: true,
                        versoes: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: number, instituicaoCodigo: number) {
        const rotina = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
            include: {
                criador: {
                    select: {
                        USRCodigo: true,
                        USRNome: true,
                        USREmail: true,
                    },
                },
                versoes: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        criador: {
                            select: {
                                USRCodigo: true,
                                USRNome: true,
                            },
                        },
                    },
                },
                execucoes: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });

        if (!rotina) {
            throw new NotFoundException('Rotina não encontrada');
        }

        return rotina;
    }

    async create(data: any, instituicaoCodigo: number, usuarioCodigo: number) {
        // Validar duplicidade de webhook path + método na mesma instituição
        if (data.ROTTipo === 'WEBHOOK' && data.ROTWebhookPath && data.ROTWebhookMetodo) {
            const duplicate = await this.prisma.rOTRotina.findFirst({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo || data.INSInstituicaoCodigo,
                    ROTWebhookPath: data.ROTWebhookPath,
                    ROTWebhookMetodo: data.ROTWebhookMetodo as HttpMetodo,
                },
            });
            if (duplicate) {
                throw new ConflictException(
                    `Já existe um webhook com o caminho "${data.ROTWebhookPath}" e método "${data.ROTWebhookMetodo}" nesta instituição (Rotina: ${duplicate.ROTNome}).`
                );
            }
        }

        const rotina = await this.prisma.rOTRotina.create({
            data: {
                ROTNome: data.ROTNome,
                ROTDescricao: data.ROTDescricao,
                ROTTipo: data.ROTTipo as TipoRotina,
                ROTCronExpressao: data.ROTCronExpressao,
                ROTWebhookPath: data.ROTWebhookPath,
                ROTWebhookMetodo: data.ROTWebhookMetodo as HttpMetodo,
                ROTWebhookAguardar: data.ROTWebhookAguardar ?? false,
                ROTWebhookSeguro: data.ROTWebhookSeguro ?? true,
                ROTWebhookTokenSource: data.ROTWebhookTokenSource,
                ROTWebhookTokenKey: data.ROTWebhookTokenKey,
                ROTWebhookToken: data.ROTWebhookToken,
                ROTCodigoJS: data.ROTCodigoJS,
                ROTAtivo: data.ROTAtivo ?? true,
                ROTPermiteParalelismo: data.ROTPermiteParalelismo ?? true,
                ROTTimeoutSeconds: data.ROTTimeoutSeconds ?? 30,
                INSInstituicaoCodigo: instituicaoCodigo || data.INSInstituicaoCodigo,
                createdBy: usuarioCodigo,
            },
        });

        // Criar primeira versão
        await this.createVersion(rotina.ROTCodigo, data.ROTCodigoJS, usuarioCodigo, 'Versão inicial');

        // Agendar se for CRON e estiver ativa
        if (rotina.ROTTipo === TipoRotina.SCHEDULE && rotina.ROTAtivo && rotina.ROTCronExpressao) {
            this.schedulerService.addCronJob(
                rotina.ROTCodigo,
                rotina.ROTCronExpressao,
                rotina.INSInstituicaoCodigo,
                rotina.ROTNome
            );
        }

        return rotina;
    }

    async update(id: number, data: any, instituicaoCodigo: number, usuarioCodigo: number) {
        // Verificar se pertence à instituição
        const existing = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!existing) {
            throw new NotFoundException('Rotina não encontrada');
        }

        // Validar duplicidade de webhook path + método na mesma instituição
        const webhookPath = data.ROTWebhookPath ?? existing.ROTWebhookPath;
        const webhookMetodo = data.ROTWebhookMetodo ?? existing.ROTWebhookMetodo;
        const tipo = data.ROTTipo ?? existing.ROTTipo;

        if (tipo === 'WEBHOOK' && webhookPath && webhookMetodo) {
            const duplicate = await this.prisma.rOTRotina.findFirst({
                where: {
                    INSInstituicaoCodigo: instituicaoCodigo,
                    ROTWebhookPath: webhookPath,
                    ROTWebhookMetodo: webhookMetodo as HttpMetodo,
                    ROTCodigo: { not: id },
                },
            });
            if (duplicate) {
                throw new ConflictException(
                    `Já existe um webhook com o caminho "${webhookPath}" e método "${webhookMetodo}" nesta instituição (Rotina: ${duplicate.ROTNome}).`
                );
            }
        }

        // Se o código mudou, criar nova versão
        if (data.ROTCodigoJS && data.ROTCodigoJS !== existing.ROTCodigoJS) {
            await this.createVersion(id, data.ROTCodigoJS, usuarioCodigo, data.observacao);
        }

        const updated = await this.prisma.rOTRotina.update({
            where: { ROTCodigo: id },
            data: {
                ROTNome: data.ROTNome,
                ROTDescricao: data.ROTDescricao,
                ROTTipo: data.ROTTipo as TipoRotina,
                ROTCronExpressao: data.ROTCronExpressao,
                ROTWebhookPath: data.ROTWebhookPath,
                ROTWebhookMetodo: data.ROTWebhookMetodo as HttpMetodo,
                ROTWebhookAguardar: data.ROTWebhookAguardar,
                ROTWebhookSeguro: data.ROTWebhookSeguro,
                ROTWebhookTokenSource: data.ROTWebhookTokenSource,
                ROTWebhookTokenKey: data.ROTWebhookTokenKey,
                ROTWebhookToken: data.ROTWebhookToken,
                ROTCodigoJS: data.ROTCodigoJS,
                ROTAtivo: data.ROTAtivo,
                ROTPermiteParalelismo: data.ROTPermiteParalelismo,
                ROTTimeoutSeconds:
                    data.ROTTimeoutSeconds === undefined
                        ? undefined
                        : clampRotinaTimeoutForPersist(data.ROTTimeoutSeconds),
            },
        });

        // Cron: apenas SCHEDULE (reativação/atualização do job); WEBHOOK sempre fora do agendador.
        if (updated.ROTTipo === TipoRotina.WEBHOOK) {
            this.schedulerService.removeCronJob(updated.ROTCodigo);
        } else if (updated.ROTTipo === TipoRotina.SCHEDULE) {
            if (updated.ROTAtivo && updated.ROTCronExpressao) {
                this.schedulerService.addCronJob(
                    updated.ROTCodigo,
                    updated.ROTCronExpressao,
                    updated.INSInstituicaoCodigo,
                    updated.ROTNome
                );
            } else {
                this.schedulerService.removeCronJob(updated.ROTCodigo);
            }
        }

        return updated;
    }

    async remove(id: number, instituicaoCodigo: number) {
        const existing = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!existing) {
            throw new NotFoundException('Rotina não encontrada');
        }

        // Remove agendamento antes de deletar
        this.schedulerService.removeCronJob(id);

        // Deletar registros dependentes (exclusão em cascata manual)
        // Usando transação para garantir atomicidade
        return this.prisma.$transaction(async (tx) => {
            // 1. Deletar logs de execução
            await tx.rOTExecucaoLog.deleteMany({
                where: { ROTCodigo: id },
            });

            // 2. Deletar histórico de versões
            await tx.rOTHistoricoVersao.deleteMany({
                where: { ROTCodigo: id },
            });

            // 3. Deletar a rotina
            return tx.rOTRotina.delete({
                where: { ROTCodigo: id },
            });
        });
    }

    /**
     * Mapa rotinaCodigo → execução ativa (log EM_EXECUCAO). Jobs Rabbit mantêm o mesmo exeId até o worker finalizar;
     * não há correção automática para ERRO só porque o processo sumiu da API.
     */
    async getActiveExecutionsMap(instituicaoCodigo: number) {
        const rows = await this.prisma.rOTExecucaoLog.findMany({
            where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                EXEStatus: StatusExecucao.EM_EXECUCAO,
            },
            orderBy: { EXEInicio: 'desc' },
            select: {
                ROTCodigo: true,
                EXEIdExterno: true,
                EXECodigo: true,
                EXEInicio: true,
            },
        });

        const seen = new Set<number>();
        const out: Record<string, { running: boolean; exeId: string }> = {};

        for (const row of rows) {
            if (seen.has(row.ROTCodigo)) continue;
            seen.add(row.ROTCodigo);

            const resolved = this.resolveRunningExecutionRow(row);
            if (resolved.running && resolved.exeId) {
                out[String(row.ROTCodigo)] = { running: true, exeId: resolved.exeId };
            }
        }

        return out;
    }

    async getActiveExecution(rotinaCodigo: number, instituicaoCodigo: number) {
        await this.findOne(rotinaCodigo, instituicaoCodigo);

        const row = await this.prisma.rOTExecucaoLog.findFirst({
            where: {
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
                EXEStatus: StatusExecucao.EM_EXECUCAO,
            },
            orderBy: { EXEInicio: 'desc' },
            select: { EXEIdExterno: true, EXECodigo: true, EXEInicio: true },
        });

        if (!row) {
            return { running: false, exeId: null };
        }

        return this.resolveRunningExecutionRow(row);
    }

    /** Linha já é EM_EXECUCAO; execução manual neste nó ou job na fila compartilham o mesmo critério de “ativa”. */
    private resolveRunningExecutionRow(row: { EXEIdExterno: string }): { running: boolean; exeId: string | null } {
        return { running: true, exeId: row.EXEIdExterno };
    }

    async executeManual(id: number, instituicaoCodigo: number) {
        const rotina = await this.findOne(id, instituicaoCodigo);

        const exeId = await this.executionService.startExecution(
            rotina.ROTCodigo,
            instituicaoCodigo,
            'MANUAL',
            { manual: true },
            { skipActiveCheck: true },
        );

        return {
            message: 'Execução iniciada',
            exeId,
            rotinaCodigo: rotina.ROTCodigo,
            rotinaName: rotina.ROTNome,
        };
    }

    async cancelExecution(exeId: string, rotinaCodigo: number, instituicaoCodigo: number) {
        const execLog = await this.prisma.rOTExecucaoLog.findFirst({
            where: {
                EXEIdExterno: exeId,
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!execLog) {
            throw new NotFoundException('Execução não encontrada');
        }

        if (execLog.EXEStatus !== StatusExecucao.EM_EXECUCAO) {
            throw new ConflictException('Execução não está em andamento');
        }

        // 1) Tenta kill local (MANUAL executions run in webapi)
        const killedLocal = this.processManager.killProcess(exeId);

        if (!killedLocal) {
            // 2) Marca status cancelado e notifica workers remotos
            await this.rotinaQueueService.cancelJob(exeId);
            await this.rotinaQueueService.sendCancelSignal(exeId);
        }

        return { message: 'Execução cancelada', exeId };
    }

    async clearSerialExecutionLock(rotinaCodigo: number, instituicaoCodigo: number) {
        const existing = await this.prisma.rOTRotina.findFirst({
            where: { ROTCodigo: rotinaCodigo, INSInstituicaoCodigo: instituicaoCodigo },
            select: { ROTCodigo: true },
        });
        if (!existing) {
            throw new NotFoundException('Rotina não encontrada');
        }
        return this.rotinaQueueService.clearSerialInflightZset(instituicaoCodigo, rotinaCodigo);
    }

    async getExecution(exeId: string, instituicaoCodigo: number) {
        const execLog = await this.prisma.rOTExecucaoLog.findFirst({
            where: {
                EXEIdExterno: exeId,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!execLog) {
            throw new NotFoundException('Execução não encontrada');
        }

        return execLog;
    }

    private async createVersion(
        rotinaCodigo: number,
        codigoJS: string,
        usuarioCodigo: number,
        observacao?: string,
    ) {
        return this.prisma.rOTHistoricoVersao.create({
            data: {
                ROTCodigo: rotinaCodigo,
                HVICodigoJS: codigoJS,
                HVIObservacao: observacao,
                createdBy: usuarioCodigo,
            },
        });
    }

    async getVersions(rotinaCodigo: number, instituicaoCodigo: number) {
        // Verificar se a rotina pertence à instituição
        const rotina = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!rotina) {
            throw new NotFoundException('Rotina não encontrada');
        }

        return this.prisma.rOTHistoricoVersao.findMany({
            where: { ROTCodigo: rotinaCodigo },
            include: {
                criador: {
                    select: {
                        USRCodigo: true,
                        USRNome: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async restoreVersion(versionId: number, instituicaoCodigo: number, usuarioCodigo: number) {
        const version = await this.prisma.rOTHistoricoVersao.findUnique({
            where: { HVICodigo: versionId },
            include: {
                rotina: true,
            },
        });

        if (!version) {
            throw new NotFoundException('Versão não encontrada');
        }

        if (version.rotina.INSInstituicaoCodigo !== instituicaoCodigo) {
            throw new ForbiddenException('Acesso negado');
        }

        // Atualizar rotina com código da versão
        await this.prisma.rOTRotina.update({
            where: { ROTCodigo: version.ROTCodigo },
            data: { ROTCodigoJS: version.HVICodigoJS },
        });

        // Criar nova versão com o restore
        await this.createVersion(
            version.ROTCodigo,
            version.HVICodigoJS,
            usuarioCodigo,
            `Restaurado da versão ${versionId}`,
        );

        return { message: 'Versão restaurada com sucesso' };
    }

    async deleteVersion(versionId: number, instituicaoCodigo: number) {
        const version = await this.prisma.rOTHistoricoVersao.findUnique({
            where: { HVICodigo: versionId },
            include: {
                rotina: true,
            },
        });

        if (!version) {
            throw new NotFoundException('Versão não encontrada');
        }

        if (version.rotina.INSInstituicaoCodigo !== instituicaoCodigo) {
            throw new ForbiddenException('Acesso negado');
        }

        return this.prisma.rOTHistoricoVersao.delete({
            where: { HVICodigo: versionId },
        });
    }
    async deleteVersions(versionIds: number[], instituicaoId: number) {
        // Verifica se todas as versões pertencem a rotinas da instituição
        const versions = await this.prisma.rOTHistoricoVersao.findMany({
            where: {
                HVICodigo: { in: versionIds },
                rotina: {
                    INSInstituicaoCodigo: instituicaoId
                }
            },
            select: { HVICodigo: true }
        });

        // Opcional: Validar se encontrou todas. 
        // Se a UI mandar IDs que não existem (ex: deletados por outro user), findMany retorna menos.
        // Vamos deletar apenas o que encontramos para ser idempotente/seguro.

        if (versions.length === 0) {
            return { count: 0 };
        }

        const idsToDelete = versions.map(v => v.HVICodigo);

        return this.prisma.rOTHistoricoVersao.deleteMany({
            where: {
                HVICodigo: { in: idsToDelete }
            }
        });
    }

    async getExecutionLogs(
        rotinaCodigo: number,
        instituicaoCodigo: number,
        search?: string,
        limit: number = 50,
        levels?: string[],
        startDate?: string,
        endDate?: string,
    ) {
        const rotina = await this.prisma.rOTRotina.findFirst({
            where: {
                ROTCodigo: rotinaCodigo,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });

        if (!rotina) {
            throw new NotFoundException('Rotina não encontrada');
        }

        // Filtro básico por rotina
        const where: any = {
            ROTCodigo: rotinaCodigo,
        };

        // Filtro de Data
        if (startDate || endDate) {
            where.EXEInicio = {};
            if (startDate) where.EXEInicio.gte = new Date(startDate);
            if (endDate) where.EXEInicio.lte = new Date(endDate);
        }

        // Filtro de Busca (Texto no Erro)
        // Removido: A busca no banco limitava apenas a erros da execução.
        // Como queremos buscar dentro do JSON de logs, faremos em memória.
        // { EXEErro: { contains: search, mode: 'insensitive' } },

        // Limit expandido para permitir filtragem em memória
        const dbLimit = (search || levels) ? limit * 5 : limit;

        const executions = await this.prisma.rOTExecucaoLog.findMany({
            where,
            orderBy: { EXEInicio: 'desc' },
            take: dbLimit,
        });

        // Pós-processamento para filtrar logs individuais dentro do JSON
        if (search || levels) {
            const searchLower = search?.toLowerCase();

            return executions.map(exec => {
                let filteredLogs = (exec.EXELogs as any[]) || [];

                if (Array.isArray(filteredLogs)) {
                    filteredLogs = filteredLogs.filter(log => {
                        // Filtro por Nível
                        if (levels && levels.length > 0 && !levels.includes(log.level)) {
                            return false;
                        }

                        // Filtro por Mensagem (Search)
                        if (searchLower) {
                            const msgMatch = log.message?.toLowerCase().includes(searchLower);
                            const levelMatch = log.level?.toLowerCase().includes(searchLower);
                            return msgMatch || levelMatch;
                        }

                        return true;
                    });
                }

                const executionErrorMatch = searchLower && exec.EXEErro?.toLowerCase().includes(searchLower);

                // Se filtramos logs e sobrou zero, E não deu match no erro global, ignoramos esta execução
                if (filteredLogs.length === 0 && !executionErrorMatch) {
                    if (search || levels) return null;
                }

                return {
                    ...exec,
                    EXELogs: filteredLogs
                };
            }).filter(Boolean).slice(0, limit) as any[];
        }

        return executions;
    }
}
