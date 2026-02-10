import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateMatriculaDto, UpdateMatriculaDto } from './dto/matricula.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class MatriculaService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateMatriculaDto) {
        return this.prisma.rls.mATMatricula.create({ data: dto });
    }

    async findAll(query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.rls.mATMatricula.findMany({
                skip,
                take: limit,
                include: { pessoa: { select: { PESCodigo: true, PESNome: true } } },
                orderBy: { MATCodigo: 'desc' },
            }),
            this.prisma.rls.mATMatricula.count(),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: number) {
        const mat = await this.prisma.rls.mATMatricula.findUnique({
            where: { MATCodigo: id },
            include: { pessoa: true },
        });
        if (!mat) throw new NotFoundException(`Matrícula ${id} não encontrada`);
        return mat;
    }

    async update(id: number, dto: UpdateMatriculaDto) {
        await this.findOne(id);
        return this.prisma.rls.mATMatricula.update({ where: { MATCodigo: id }, data: dto });
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.rls.mATMatricula.delete({ where: { MATCodigo: id } });
    }
}
