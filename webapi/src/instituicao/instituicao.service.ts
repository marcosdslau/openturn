import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateInstituicaoDto, UpdateInstituicaoDto } from './dto/instituicao.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class InstituicaoService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateInstituicaoDto) {
        return this.prisma.iNSInstituicao.create({ data: dto });
    }

    async findAll(query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.iNSInstituicao.findMany({
                skip,
                take: limit,
                include: { cliente: { select: { CLICodigo: true, CLINome: true } } },
                orderBy: { INSCodigo: 'desc' },
            }),
            this.prisma.iNSInstituicao.count(),
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
        return this.prisma.iNSInstituicao.update({ where: { INSCodigo: id }, data: dto });
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.iNSInstituicao.delete({ where: { INSCodigo: id } });
    }
}
