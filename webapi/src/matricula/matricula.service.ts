import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateMatriculaDto, UpdateMatriculaDto } from './dto/matricula.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class MatriculaService {
    constructor(private prisma: PrismaService) { }

    async create(instituicaoCodigo: number, dto: CreateMatriculaDto) {
        return this.prisma.rls.mATMatricula.create({
            data: { ...dto, INSInstituicaoCodigo: instituicaoCodigo }
        });
    }

    async findAll(instituicaoCodigo: number, query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.rls.mATMatricula.findMany({
                where: { INSInstituicaoCodigo: instituicaoCodigo },
                skip,
                take: limit,
                include: { pessoa: { select: { PESCodigo: true, PESNome: true } } },
                orderBy: { MATCodigo: 'desc' },
            }),
            this.prisma.rls.mATMatricula.count({
                where: { INSInstituicaoCodigo: instituicaoCodigo }
            }),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(instituicaoCodigo: number, id: number) {
        const mat = await this.prisma.rls.mATMatricula.findFirst({
            where: {
                MATCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo
            },
            include: { pessoa: true },
        });
        if (!mat) throw new NotFoundException(`Matrícula ${id} não encontrada para esta instituição`);
        return mat;
    }

    async update(instituicaoCodigo: number, id: number, dto: UpdateMatriculaDto) {
        await this.findOne(instituicaoCodigo, id);
        return this.prisma.rls.mATMatricula.update({
            where: { MATCodigo: id },
            data: dto
        });
    }

    async remove(instituicaoCodigo: number, id: number) {
        await this.findOne(instituicaoCodigo, id);
        return this.prisma.rls.mATMatricula.delete({
            where: { MATCodigo: id }
        });
    }
}
