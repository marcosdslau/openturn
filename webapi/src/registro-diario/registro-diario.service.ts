import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { QueryRegistroDiarioDto } from './dto/registro-diario.dto';
import { parseIsoDateOnlyToUtcNoon } from '../common/utils/date-only.utils';
import { resizeBase64Image } from '../common/utils/image.utils';

@Injectable()
export class RegistroDiarioService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    instituicaoCodigo: number,
    query: QueryRegistroDiarioDto,
  ): Promise<PaginatedResult<any>> {
    const { page, limit, PESCodigo, nome, documento, grupo, MATCurso, MATSerie, MATTurma, dataInicio, dataFim } = query;
    const skip = (page - 1) * limit;

    const pessoaWhere: Prisma.PESPessoaWhereInput = {};
    if (nome) pessoaWhere.PESNome = { contains: nome, mode: 'insensitive' };
    if (documento) pessoaWhere.PESDocumento = { contains: documento, mode: 'insensitive' };
    if (grupo) pessoaWhere.PESGrupo = grupo;

    const matriculaWhere: Prisma.MATMatriculaWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
      MATAtivo: true,
    };
    if (MATCurso) matriculaWhere.MATCurso = { contains: MATCurso, mode: 'insensitive' };
    if (MATSerie) matriculaWhere.MATSerie = { contains: MATSerie, mode: 'insensitive' };
    if (MATTurma) matriculaWhere.MATTurma = { contains: MATTurma, mode: 'insensitive' };

    const where: Prisma.RPDRegistrosDiariosWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
    };

    if (PESCodigo) where.PESCodigo = PESCodigo;
    if (dataInicio || dataFim) {
      where.RPDData = {};
      if (dataInicio)
        where.RPDData.gte = parseIsoDateOnlyToUtcNoon(dataInicio);
      if (dataFim) where.RPDData.lte = parseIsoDateOnlyToUtcNoon(dataFim);
    }

    const hasPessoaFilter = nome || documento || grupo;
    const hasMatriculaFilter = MATCurso || MATSerie || MATTurma;

    if (hasPessoaFilter || hasMatriculaFilter) {
      where.pessoa = { ...pessoaWhere };
      if (hasMatriculaFilter) {
        where.pessoa.matriculas = { some: matriculaWhere };
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.rls.rPDRegistrosDiarios.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ RPDData: 'desc' }, { RPDCodigo: 'desc' }],
        include: {
          pessoa: {
            select: {
              PESCodigo: true,
              PESNome: true,
              PESNomeSocial: true,
              PESDocumento: true,
              PESGrupo: true,
              PESFotoBase64: true,
              PESFotoExtensao: true,
              matriculas: {
                where: { INSInstituicaoCodigo: instituicaoCodigo, MATAtivo: true },
                orderBy: { MATCodigo: 'desc' },
                take: 1,
                select: { MATNumero: true, MATCurso: true, MATSerie: true, MATTurma: true },
              },
            },
          },
        },
      }),
      this.prisma.rls.rPDRegistrosDiarios.count({ where }),
    ]);

    const serialized = await Promise.all(
      data.map(async (row: any) => {
        const pes = row.pessoa;
        if (!pes) return row;
        let PESFotoThumbnailBase64: string | null = null;
        let PESFotoExtensao: string | null = pes.PESFotoExtensao ?? null;
        if (pes.PESFotoBase64) {
          PESFotoThumbnailBase64 = await resizeBase64Image(
            pes.PESFotoBase64,
            48,
            48,
          );
          if (!PESFotoExtensao) PESFotoExtensao = 'jpg';
        }
        const { PESFotoBase64: _omit, ...pessoaRest } = pes;
        return {
          ...row,
          pessoa: {
            ...pessoaRest,
            PESFotoExtensao,
            PESFotoThumbnailBase64,
          },
        };
      }),
    );

    return {
      data: serialized,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
