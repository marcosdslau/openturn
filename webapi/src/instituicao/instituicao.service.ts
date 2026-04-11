import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TipoRotina } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateInstituicaoDto, UpdateInstituicaoDto } from './dto/instituicao.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';

@Injectable()
export class InstituicaoService {
    private readonly logger = new Logger(InstituicaoService.name);
    private redisPub: Redis | null = null;

    constructor(private prisma: PrismaService) {
        try {
            this.redisPub = new Redis({
                ...getRedisConnectionOptions(),
                lazyConnect: true,
            });
            this.redisPub.connect().catch(() => {
                this.logger.warn('Redis indisponível para instituicao:queue:refresh');
                this.redisPub = null;
            });
        } catch {
            this.redisPub = null;
        }
    }

    async create(dto: CreateInstituicaoDto) {
        if (dto.INSControlidMonitorRotinaAtiva === true) {
            throw new BadRequestException(
                'Configure o disparo do monitor ControlID após criar a instituição.',
            );
        }
        const data: Prisma.INSInstituicaoUncheckedCreateInput = {
            ...(dto as Prisma.INSInstituicaoUncheckedCreateInput),
            INSControlidMonitorRotinaAtiva: false,
            INSControlidMonitorRotinaCodigo: null,
        };
        const instituicao = await this.prisma.iNSInstituicao.create({ data });
        await this.publishQueueRefresh(instituicao, 'created');
        return instituicao;
    }

    async findAll(query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit, search } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.INSInstituicaoWhereInput = search ? {
            OR: [
                { INSNome: { contains: search, mode: 'insensitive' } },
                { cliente: { CLINome: { contains: search, mode: 'insensitive' } } }
            ]
        } : {};

        const [data, total] = await Promise.all([
            this.prisma.iNSInstituicao.findMany({
                where,
                skip,
                take: limit,
                include: { cliente: { select: { CLICodigo: true, CLINome: true } } },
                orderBy: { INSCodigo: 'desc' },
            }),
            this.prisma.iNSInstituicao.count({ where }),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: number) {
        const inst = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: id },
            include: { cliente: true },
        });
        if (!inst) throw new NotFoundException(`Instituição ${id} não encontrada`);
        return inst;
    }

    async update(id: number, dto: UpdateInstituicaoDto) {
        await this.findOne(id);

        const data: Record<string, unknown> = { ...dto };

        if (dto.INSControlidMonitorRotinaAtiva === false) {
            data.INSControlidMonitorRotinaCodigo = null;
        }

        if (dto.INSControlidMonitorRotinaAtiva === true) {
            const codigo = dto.INSControlidMonitorRotinaCodigo;
            if (codigo == null) {
                throw new BadRequestException(
                    'INSControlidMonitorRotinaCodigo é obrigatório quando o disparo do monitor ControlID está ativo.',
                );
            }
            const rotina = await this.prisma.rOTRotina.findFirst({
                where: {
                    ROTCodigo: codigo,
                    INSInstituicaoCodigo: id,
                    ROTTipo: TipoRotina.WEBHOOK,
                },
            });
            if (!rotina) {
                throw new BadRequestException(
                    'Rotina WEBHOOK não encontrada para esta instituição.',
                );
            }
            if (!rotina.ROTAtivo) {
                throw new BadRequestException('A rotina selecionada está inativa.');
            }
            if (!rotina.ROTWebhookPath?.trim() || !rotina.ROTWebhookMetodo) {
                throw new BadRequestException(
                    'A rotina deve ter path e método HTTP de webhook configurados.',
                );
            }
        }

        const instituicao = await this.prisma.iNSInstituicao.update({
            where: { INSCodigo: id },
            data: data as Prisma.INSInstituicaoUpdateInput,
        });
        await this.publishQueueRefresh(instituicao, 'updated');
        return instituicao;
    }

    async updateWorkerStatus(id: number, active: boolean) {
        await this.findOne(id);
        const instituicao = await this.prisma.iNSInstituicao.update({
            where: { INSCodigo: id },
            data: { INSWorkerAtivo: active },
        });
        await this.publishQueueRefresh(instituicao, 'updated');
        return instituicao;
    }

    async bulkUpdateWorkerStatus(active: boolean) {
        await this.prisma.iNSInstituicao.updateMany({ data: { INSWorkerAtivo: active } });
        await this.publishReconcileAll();
        return { ok: true, INSWorkerAtivo: active };
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.iNSInstituicao.delete({ where: { INSCodigo: id } });
    }

    private async publishQueueRefresh(
        instituicao: {
            INSCodigo: number;
            INSAtivo: boolean;
            INSMaxExecucoesSimultaneas: number;
            INSWorkerAtivo: boolean;
        },
        event: 'created' | 'updated',
    ) {
        if (!this.redisPub) return;

        const payload = JSON.stringify({
            INSCodigo: instituicao.INSCodigo,
            INSAtivo: instituicao.INSAtivo,
            INSMaxExecucoesSimultaneas: instituicao.INSMaxExecucoesSimultaneas,
            INSWorkerAtivo: instituicao.INSWorkerAtivo,
            event,
        });

        try {
            await this.redisPub.publish('openturn:instituicao:queue:refresh', payload);
        } catch (error) {
            this.logger.warn(`Falha ao publicar refresh de instituição ${instituicao.INSCodigo}: ${(error as Error).message}`);
        }
    }

    private async publishReconcileAll() {
        if (!this.redisPub) return;
        try {
            await this.redisPub.publish(
                'openturn:instituicao:queue:refresh',
                JSON.stringify({ reconcileAll: true }),
            );
        } catch (error) {
            this.logger.warn(`Falha ao publicar reconcileAll: ${(error as Error).message}`);
        }
    }
}
