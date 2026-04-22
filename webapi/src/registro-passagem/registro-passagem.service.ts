import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePassagemDto, QueryPassagemDto, UpdatePassagemDto } from './dto/passagem.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { resizeBase64Image } from '../common/utils/image.utils';

@Injectable()
export class RegistroPassagemService {
    constructor(private prisma: PrismaService) { }

    async create(instituicaoCodigo: number, dto: CreatePassagemDto) {
        const now = new Date();
        return this.prisma.rls.rEGRegistroPassagem.create({
            data: {
                PESCodigo: dto.PESCodigo,
                REGAcao: dto.REGAcao,
                EQPCodigo: dto.EQPCodigo,
                REGTimestamp: BigInt(Math.floor(now.getTime() / 1000)),
                REGDataHora: now,
                INSInstituicaoCodigo: instituicaoCodigo,
            },
        });
    }

    async update(instituicaoCodigo: number, id: number, dto: UpdatePassagemDto) {
        const existing = await this.prisma.rls.rEGRegistroPassagem.findFirst({
            where: { REGCodigo: id, INSInstituicaoCodigo: instituicaoCodigo },
        });
        if (!existing) {
            throw new NotFoundException('Passagem não encontrada');
        }
        const data: Prisma.REGRegistroPassagemUpdateInput = {};
        if (dto.REGAcao !== undefined) data.REGAcao = dto.REGAcao;
        if (dto.EQPCodigo !== undefined) {
            data.equipamento = { connect: { EQPCodigo: dto.EQPCodigo } };
        }
        if (dto.PESCodigo !== undefined) {
            data.pessoa = { connect: { PESCodigo: dto.PESCodigo } };
        }
        if (dto.REGDataHora !== undefined) {
            const d = new Date(dto.REGDataHora);
            data.REGDataHora = d;
            data.REGTimestamp = BigInt(Math.floor(d.getTime() / 1000));
        }
        return this.prisma.rls.rEGRegistroPassagem.update({
            where: { REGCodigo: id },
            data,
        });
    }

    async remove(instituicaoCodigo: number, id: number) {
        const existing = await this.prisma.rls.rEGRegistroPassagem.findFirst({
            where: { REGCodigo: id, INSInstituicaoCodigo: instituicaoCodigo },
        });
        if (!existing) {
            throw new NotFoundException('Passagem não encontrada');
        }
        return this.prisma.rls.rEGRegistroPassagem.delete({ where: { REGCodigo: id } });
    }

    async findAll(instituicaoCodigo: number, query: QueryPassagemDto): Promise<PaginatedResult<any>> {
        const { page, limit, PESCodigo, EQPCodigo, dataInicio, dataFim, REGAcao } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.REGRegistroPassagemWhereInput = {
            INSInstituicaoCodigo: instituicaoCodigo
        };
        if (PESCodigo) where.PESCodigo = PESCodigo;
        if (EQPCodigo) where.EQPCodigo = EQPCodigo;
        if (REGAcao) where.REGAcao = REGAcao;
        if (dataInicio || dataFim) {
            where.REGDataHora = {};
            if (dataInicio) where.REGDataHora.gte = new Date(dataInicio);
            if (dataFim) where.REGDataHora.lte = new Date(dataFim);
        }

        const [data, total] = await Promise.all([
            this.prisma.rls.rEGRegistroPassagem.findMany({
                where,
                skip,
                take: limit,
                include: {
                    pessoa: {
                        select: {
                            PESCodigo: true,
                            PESNome: true,
                            PESDocumento: true,
                            PESFotoBase64: true,
                            PESFotoExtensao: true,
                        },
                    },
                    equipamento: { select: { EQPCodigo: true, EQPDescricao: true } },
                },
                orderBy: { REGDataHora: 'desc' },
            }),
            this.prisma.rls.rEGRegistroPassagem.count({ where }),
        ]);

        const serialized = await Promise.all(
            data.map(async (d: any) => {
                const pes = d.pessoa;
                if (!pes) {
                    return { ...d, REGTimestamp: Number(d.REGTimestamp) };
                }
                let PESFotoThumbnailBase64: string | null = null;
                let PESFotoExtensao: string | null = pes.PESFotoExtensao ?? null;
                if (pes.PESFotoBase64) {
                    PESFotoThumbnailBase64 = await resizeBase64Image(pes.PESFotoBase64, 48, 48);
                    if (!PESFotoExtensao) PESFotoExtensao = 'jpg';
                }
                const { PESFotoBase64: _omit, ...pessoaRest } = pes;
                return {
                    ...d,
                    REGTimestamp: Number(d.REGTimestamp),
                    pessoa: {
                        ...pessoaRest,
                        PESFotoExtensao,
                        PESFotoThumbnailBase64,
                    },
                };
            }),
        );

        return {
            data: serialized,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }
}
