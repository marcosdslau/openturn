import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ExecutionService } from './engine/execution.service';
import { SchedulerService } from './scheduler.service';
import { TipoRotina, HttpMetodo, WebhookTokenSource } from '@prisma/client';

@Injectable()
export class RotinaService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly executionService: ExecutionService,
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
        const rotina = await this.prisma.rOTRotina.create({
            data: {
                ROTNome: data.ROTNome,
                ROTDescricao: data.ROTDescricao,
                ROTTipo: data.ROTTipo as TipoRotina,
                ROTCronExpressao: data.ROTCronExpressao,
                ROTWebhookPath: data.ROTWebhookPath,
                ROTWebhookMetodo: data.ROTWebhookMetodo as HttpMetodo,
                ROTWebhookSeguro: data.ROTWebhookSeguro ?? true,
                ROTWebhookTokenSource: data.ROTWebhookTokenSource,
                ROTWebhookTokenKey: data.ROTWebhookTokenKey,
                ROTWebhookToken: data.ROTWebhookToken,
                ROTCodigoJS: data.ROTCodigoJS,
                ROTAtivo: data.ROTAtivo ?? true,
                ROTTimeoutSeconds: data.ROTTimeoutSeconds ?? 30,
                INSInstituicaoCodigo: instituicaoCodigo || data.INSInstituicaoCodigo,
                createdBy: usuarioCodigo,
            },
        });

        // Criar primeira versão
        await this.createVersion(rotina.ROTCodigo, data.ROTCodigoJS, usuarioCodigo, 'Versão inicial');

        // Agendar se for CRON e estiver ativa
        if (rotina.ROTTipo === 'SCHEDULE' && rotina.ROTAtivo && rotina.ROTCronExpressao) {
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
                ROTWebhookSeguro: data.ROTWebhookSeguro,
                ROTWebhookTokenSource: data.ROTWebhookTokenSource,
                ROTWebhookTokenKey: data.ROTWebhookTokenKey,
                ROTWebhookToken: data.ROTWebhookToken,
                ROTCodigoJS: data.ROTCodigoJS,
                ROTAtivo: data.ROTAtivo,
                ROTTimeoutSeconds: data.ROTTimeoutSeconds,
            },
        });

        // Atualizar agendamento
        if (updated.ROTTipo === 'SCHEDULE') {
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
        } else {
            // Se mudou de tipo ou algo assim, garante remoção
            this.schedulerService.removeCronJob(updated.ROTCodigo);
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

        return this.prisma.rOTRotina.delete({
            where: { ROTCodigo: id },
        });
    }

    async executeManual(id: number, instituicaoCodigo: number) {
        const rotina = await this.findOne(id, instituicaoCodigo);

        // Executa rotina via ExecutionService
        const result = await this.executionService.execute(
            rotina.ROTCodigo,
            instituicaoCodigo,
            'MANUAL',
            { manual: true },
        );

        return {
            message: 'Execução concluída',
            rotinaCodigo: rotina.ROTCodigo,
            rotinaName: rotina.ROTNome,
            ...result,
        };
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
}
