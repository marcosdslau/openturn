import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePessoaDto, UpdatePessoaDto } from './dto/pessoa.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class PessoaService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreatePessoaDto) {
        return this.prisma.rls.pESPessoa.create({ data: dto });
    }

    async findAll(query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.rls.pESPessoa.findMany({
                skip,
                take: limit,
                include: { matriculas: true },
                orderBy: { PESCodigo: 'desc' },
            }),
            this.prisma.rls.pESPessoa.count(),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: number) {
        const pessoa = await this.prisma.rls.pESPessoa.findUnique({
            where: { PESCodigo: id },
            include: { matriculas: true },
        });
        if (!pessoa) throw new NotFoundException(`Pessoa ${id} não encontrada`);
        return pessoa;
    }

    async update(id: number, dto: UpdatePessoaDto) {
        await this.findOne(id);
        return this.prisma.rls.pESPessoa.update({ where: { PESCodigo: id }, data: dto });
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.rls.pESPessoa.update({
            where: { PESCodigo: id },
            data: { deletedAt: new Date(), PESAtivo: false },
        });
    }
}
