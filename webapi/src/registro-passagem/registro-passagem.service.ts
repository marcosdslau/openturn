import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePassagemDto, QueryPassagemDto } from './dto/passagem.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

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
                    pessoa: { select: { PESCodigo: true, PESNome: true, PESDocumento: true } },
                    equipamento: { select: { EQPCodigo: true, EQPDescricao: true } },
                },
                orderBy: { REGDataHora: 'desc' },
            }),
            this.prisma.rls.rEGRegistroPassagem.count({ where }),
        ]);

        // Serialize BigInt for JSON response
        const serialized = data.map((d: any) => ({
            ...d,
            REGTimestamp: Number(d.REGTimestamp),
        }));

        return {
            data: serialized,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }
}
