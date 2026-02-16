import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePessoaDto, UpdatePessoaDto } from './dto/pessoa.dto';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { resizeBase64Image } from '../common/utils/image.utils';

@Injectable()
export class PessoaService {
    constructor(private prisma: PrismaService) { }

    async create(instituicaoCodigo: number, dto: CreatePessoaDto) {
        return this.prisma.rls.pESPessoa.create({
            data: { ...dto, INSInstituicaoCodigo: instituicaoCodigo }
        });
    }

    async findAll(instituicaoCodigo: number, query: PaginationDto): Promise<PaginatedResult<any>> {
        const { page, limit } = query;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.rls.pESPessoa.findMany({
                where: { INSInstituicaoCodigo: instituicaoCodigo },
                skip,
                take: limit,
                include: { matriculas: true },
                orderBy: { PESCodigo: 'desc' },
            }),
            this.prisma.rls.pESPessoa.count({
                where: { INSInstituicaoCodigo: instituicaoCodigo }
            }),
        ]);

        // Generate thumbnails for the list
        const processedData = await Promise.all(data.map(async (p) => {
            if (p.PESFotoBase64) {
                p.PESFotoBase64 = await resizeBase64Image(p.PESFotoBase64, 72, 72);
            }
            return p;
        }));

        return {
            data: processedData,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(instituicaoCodigo: number, id: number) {
        const pessoa = await this.prisma.rls.pESPessoa.findFirst({
            where: {
                PESCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo
            },
            include: { matriculas: true },
        });
        if (!pessoa) throw new NotFoundException(`Pessoa ${id} não encontrada para esta instituição`);
        return pessoa;
    }

    async update(instituicaoCodigo: number, id: number, dto: UpdatePessoaDto) {
        await this.findOne(instituicaoCodigo, id);
        return this.prisma.rls.pESPessoa.update({
            where: { PESCodigo: id },
            data: dto
        });
    }

    async remove(instituicaoCodigo: number, id: number) {
        await this.findOne(instituicaoCodigo, id);
        return this.prisma.rls.pESPessoa.update({
            where: { PESCodigo: id },
            data: { deletedAt: new Date(), PESAtivo: false },
        });
    }
}
