import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class ClienteService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateClienteDto) {
        return this.prisma.cLICliente.create({ data: dto });
    }

    async findAll(query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.cLICliente.findMany({
                skip,
                take: limit,
                include: { instituicoes: { select: { INSCodigo: true, INSNome: true } } },
                orderBy: { CLICodigo: 'desc' },
            }),
            this.prisma.cLICliente.count(),
        ]);

        return {
            data,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: number) {
        const cliente = await this.prisma.cLICliente.findUnique({
            where: { CLICodigo: id },
            include: { instituicoes: true },
        });
        if (!cliente) throw new NotFoundException(`Cliente ${id} não encontrado`);
        return cliente;
    }

    async update(id: number, dto: UpdateClienteDto) {
        await this.findOne(id);
        return this.prisma.cLICliente.update({ where: { CLICodigo: id }, data: dto });
    }

    async remove(id: number) {
        await this.findOne(id);
        return this.prisma.cLICliente.delete({ where: { CLICodigo: id } });
    }
}
