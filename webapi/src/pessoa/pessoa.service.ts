import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePessoaDto, UpdatePessoaDto, QueryPessoaDto } from './dto/pessoa.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { resizeBase64Image } from '../common/utils/image.utils';

@Injectable()
export class PessoaService {
    constructor(private prisma: PrismaService) { }

    async create(instituicaoCodigo: number, dto: CreatePessoaDto) {
        return this.prisma.rls.pESPessoa.create({
            data: { ...dto, INSInstituicaoCodigo: instituicaoCodigo }
        });
    }

    async findAll(instituicaoCodigo: number, query: QueryPessoaDto): Promise<PaginatedResult<any>> {
        const { page, limit, nome, documento, email, grupo, cartaoTag, ativo } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.PESPessoaWhereInput = {
            INSInstituicaoCodigo: instituicaoCodigo,
            ...(nome && {
                OR: [
                    { PESNome: { contains: nome, mode: 'insensitive' } },
                    { PESNomeSocial: { contains: nome, mode: 'insensitive' } },
                ],
            }),
            ...(documento && { PESDocumento: { contains: documento, mode: 'insensitive' } }),
            ...(email && { PESEmail: { contains: email, mode: 'insensitive' } }),
                       ...(grupo && { PESGrupo: { equals: grupo, mode: 'insensitive' } }),
            ...(cartaoTag && { PESCartaoTag: { contains: cartaoTag, mode: 'insensitive' } }),
            ...(ativo !== undefined && { PESAtivo: ativo }),
            deletedAt: null,
        };

        const [data, total] = await Promise.all([
            this.prisma.rls.pESPessoa.findMany({
                where,
                skip,
                take: limit,
                //include: { matriculas: true },
                orderBy: { PESNome: 'asc' },
            }),
            this.prisma.rls.pESPessoa.count({ where }),
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

    async findDistinctGrupos(instituicaoCodigo: number): Promise<string[]> {
        const rows = await this.prisma.rls.pESPessoa.groupBy({
            by: ['PESGrupo'],
            where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                deletedAt: null,
                PESGrupo: { not: null },
            },
            orderBy: { PESGrupo: 'asc' },
        });
        return rows
            .map((r) => r.PESGrupo)
            .filter((g): g is string => g != null && g !== '');
    }

    async findOne(instituicaoCodigo: number, id: number) {
        const pessoa = await this.prisma.rls.pESPessoa.findFirst({
            where: {
                PESCodigo: id,
                INSInstituicaoCodigo: instituicaoCodigo
            },
            //include: { matriculas: true },
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

    async findMappings(instituicaoCodigo: number, id: number) {
        await this.findOne(instituicaoCodigo, id);
        return this.prisma.rls.pESEquipamentoMapeamento.findMany({
            where: { PESCodigo: id },
            include: {
                equipamento: {
                    select: {
                        EQPDescricao: true,
                        EQPMarca: true,
                        EQPModelo: true,
                    },
                },
            },
        });
    }
}
