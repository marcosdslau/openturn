import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateMatriculaDto,
  QueryMatriculaDto,
  UpdateMatriculaDto,
} from './dto/matricula.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { resizeBase64Image } from '../common/utils/image.utils';

@Injectable()
export class MatriculaService {
  constructor(private prisma: PrismaService) {}

  async create(instituicaoCodigo: number, dto: CreateMatriculaDto) {
    return this.prisma.rls.mATMatricula.create({
      data: { ...dto, INSInstituicaoCodigo: instituicaoCodigo },
    });
  }

  async findAll(
    instituicaoCodigo: number,
    query: QueryMatriculaDto,
  ): Promise<PaginatedResult<any>> {
    const { page, limit, nome, numero, curso, serie, turma } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.MATMatriculaWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
      pessoa: {
        deletedAt: null,
        ...(nome && {
          OR: [
            { PESNome: { contains: nome, mode: 'insensitive' } },
            { PESNomeSocial: { contains: nome, mode: 'insensitive' } },
          ],
        }),
      },
      ...(numero && { MATNumero: { contains: numero, mode: 'insensitive' } }),
      ...(curso?.length && { MATCurso: { in: curso } }),
      ...(serie?.length && { MATSerie: { in: serie } }),
      ...(turma?.length && { MATTurma: { in: turma } }),
    };

    // findMany e count em sequência para não competir por 2 ligações em paralelo no mesmo request
    // (extensão RLS usa $transaction em cada operação, o que aperta o pool com muita concorrência)
    const data = await this.prisma.rls.mATMatricula.findMany({
      where,
      skip,
      take: limit,
      include: {
        pessoa: {
          select: {
            PESCodigo: true,
            PESNome: true,
            PESFotoBase64: true,
            PESFotoExtensao: true,
          },
        },
      },
      orderBy: { MATCodigo: 'desc' },
    });
    const total = await this.prisma.rls.mATMatricula.count({ where });

    // Generate thumbnails for the person photos in the list
    const processedData = await Promise.all(
      data.map(async (m) => {
        if (m.pessoa?.PESFotoBase64) {
          m.pessoa.PESFotoBase64 = await resizeBase64Image(
            m.pessoa.PESFotoBase64,
            72,
            72,
          );
        }
        return m;
      }),
    );

    return {
      data: processedData,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOpcoesFiltro(instituicaoCodigo: number): Promise<{
    cursos: string[];
    series: string[];
    turmas: string[];
  }> {
    const base: Prisma.MATMatriculaWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
    };

    const cursoRows = await this.prisma.rls.mATMatricula.groupBy({
      by: ['MATCurso'],
      where: { ...base, MATCurso: { not: null } },
    });
    const serieRows = await this.prisma.rls.mATMatricula.groupBy({
      by: ['MATSerie'],
      where: { ...base, MATSerie: { not: null } },
    });
    const turmaRows = await this.prisma.rls.mATMatricula.groupBy({
      by: ['MATTurma'],
      where: { ...base, MATTurma: { not: null } },
    });

    const sortPt = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    const clean = (vals: (string | null)[]) =>
      Array.from(
        new Set(
          vals
            .filter((v): v is string => v != null && v.trim() !== '')
            .map((s) => s.trim()),
        ),
      ).sort(sortPt);

    return {
      cursos: clean(cursoRows.map((r) => r.MATCurso)),
      series: clean(serieRows.map((r) => r.MATSerie)),
      turmas: clean(turmaRows.map((r) => r.MATTurma)),
    };
  }

  async findOne(instituicaoCodigo: number, id: number) {
    const mat = await this.prisma.rls.mATMatricula.findFirst({
      where: {
        MATCodigo: id,
        INSInstituicaoCodigo: instituicaoCodigo,
      },
      include: { pessoa: true },
    });
    if (!mat)
      throw new NotFoundException(
        `Matrícula ${id} não encontrada para esta instituição`,
      );
    return mat;
  }

  async update(instituicaoCodigo: number, id: number, dto: UpdateMatriculaDto) {
    await this.findOne(instituicaoCodigo, id);
    return this.prisma.rls.mATMatricula.update({
      where: { MATCodigo: id },
      data: dto,
    });
  }

  async remove(instituicaoCodigo: number, id: number) {
    await this.findOne(instituicaoCodigo, id);
    return this.prisma.rls.mATMatricula.delete({
      where: { MATCodigo: id },
    });
  }
}
