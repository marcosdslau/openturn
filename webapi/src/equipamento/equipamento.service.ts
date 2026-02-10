import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateEquipamentoDto, UpdateEquipamentoDto } from './dto/equipamento.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class EquipamentoService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateEquipamentoDto) {
        return this.prisma.rls.eQPEquipamento.create({ data: dto });
    }

    async findAll(query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.rls.eQPEquipamento.findMany({
                skip,
                take: limit,
                orderBy: { EQPCodigo: 'desc' },
            }),
            this.prisma.rls.eQPEquipamento.count(),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: number) {
        const equip = await this.prisma.rls.eQPEquipamento.findUnique({
            where: { EQPCodigo: id },
        });
        if (!equip) throw new NotFoundException(`Equipamento ${id} não encontrado`);
        return equip;
    }

    async update(id: number, dto: UpdateEquipamentoDto) {
        await this.findOne(id);
        return this.prisma.rls.eQPEquipamento.update({ where: { EQPCodigo: id }, data: dto });
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.rls.eQPEquipamento.delete({ where: { EQPCodigo: id } });
    }
}
