import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
        const instituicao = await this.prisma.iNSInstituicao.create({ data: dto });
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
        const instituicao = await this.prisma.iNSInstituicao.update({ where: { INSCodigo: id }, data: dto });
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
