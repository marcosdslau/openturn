import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateEquipamentoDto, UpdateEquipamentoDto } from './dto/equipamento.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class EquipamentoService {
    constructor(private prisma: PrismaService) { }

    async create(instituicaoCodigo: number, dto: CreateEquipamentoDto) {
        return this.prisma.rls.eQPEquipamento.create({
            data: { ...dto, INSInstituicaoCodigo: instituicaoCodigo }
        });
    }

    async findAll(instituicaoCodigo: number, query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.rls.eQPEquipamento.findMany({
                where: { INSInstituicaoCodigo: instituicaoCodigo },
                skip,
                take: limit,
                orderBy: { EQPCodigo: 'desc' },
            }),
            this.prisma.rls.eQPEquipamento.count({
                where: { INSInstituicaoCodigo: instituicaoCodigo }
            }),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(instituicaoCodigo: number, id: number) {
        const equip = await this.prisma.rls.eQPEquipamento.findFirst({
            where: {
                EQPCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo
            },
        });
        if (!equip) throw new NotFoundException(`Equipamento ${id} não encontrado para esta instituição`);
        return equip;
    }

    async update(instituicaoCodigo: number, id: number, dto: UpdateEquipamentoDto) {
        await this.findOne(instituicaoCodigo, id);
        return this.prisma.rls.eQPEquipamento.update({
            where: { EQPCodigo: id },
            data: dto
        });
    }

    async remove(instituicaoCodigo: number, id: number) {
        await this.findOne(instituicaoCodigo, id);
        return this.prisma.rls.eQPEquipamento.delete({
            where: { EQPCodigo: id }
        });
    }
}
