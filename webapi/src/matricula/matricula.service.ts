import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateMatriculaDto,
  ExportMatriculaQueryDto,
  MatriculaExportFormat,
  MatriculaPdfOrientation,
  QueryMatriculaDto,
  UpdateMatriculaDto,
} from './dto/matricula.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { resizeBase64Image } from '../common/utils/image.utils';
import { format as formatDate } from 'date-fns';
import {
  buildCsvBuffer,
  buildPdfBuffer,
  buildXlsxBuffer,
  computeMatriculaPdfPhotoPxForResize,
  type MatriculaExportRow,
  type MatriculaPdfExportRow,
  type MatriculaPdfLayoutOptions,
} from './matricula-export.builder';

const MAX_EXPORT_ROWS = 50_000;

@Injectable()
export class MatriculaService {
  constructor(private prisma: PrismaService) {}

  private buildMatriculaWhere(
    instituicaoCodigo: number,
    filters: Pick<
      QueryMatriculaDto,
      'nome' | 'numero' | 'curso' | 'serie' | 'turma'
    >,
  ): Prisma.MATMatriculaWhereInput {
    const { nome, numero, curso, serie, turma } = filters;

    return {
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
  }

  async create(instituicaoCodigo: number, dto: CreateMatriculaDto) {
    return this.prisma.rls.mATMatricula.create({
      data: { ...dto, INSInstituicaoCodigo: instituicaoCodigo },
    });
  }

  async findAll(
    instituicaoCodigo: number,
    query: QueryMatriculaDto,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = this.buildMatriculaWhere(instituicaoCodigo, query);

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

  async exportMatriculas(
    instituicaoCodigo: number,
    query: ExportMatriculaQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const { format: exportFormat, nome, numero, curso, serie, turma } = query;
    const where = this.buildMatriculaWhere(instituicaoCodigo, {
      nome,
      numero,
      curso,
      serie,
      turma,
    });

    const total = await this.prisma.rls.mATMatricula.count({ where });
    if (total > MAX_EXPORT_ROWS) {
      throw new PayloadTooLargeException(
        `Exportação limitada a ${MAX_EXPORT_ROWS} linhas (${total} encontradas). Aplique filtros para reduzir o resultado.`,
      );
    }

    const data = await this.prisma.rls.mATMatricula.findMany({
      where,
      include: {
        pessoa: {
          select:
            exportFormat === MatriculaExportFormat.pdf
              ? {
                  PESCodigo: true,
                  PESIdExterno: true,
                  PESNome: true,
                  PESFotoBase64: true,
                  PESFotoExtensao: true,
                }
              : {
                  PESCodigo: true,
                  PESIdExterno: true,
                  PESNome: true,
                },
        },
      },
      orderBy: { MATCodigo: 'desc' },
    });

    const rows = data as MatriculaExportRow[];

    const stamp = formatDate(new Date(), 'yyyyMMdd-HHmm');

    let buffer: Buffer;
    let contentType: string;

    switch (exportFormat) {
      case MatriculaExportFormat.csv:
        buffer = buildCsvBuffer(rows);
        contentType = 'text/csv; charset=utf-8';
        break;
      case MatriculaExportFormat.xlsx:
        buffer = await buildXlsxBuffer(rows);
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case MatriculaExportFormat.pdf: {
        const pdfOrientation =
          query.pdfOrientation ?? MatriculaPdfOrientation.landscape;
        const pdfColumns =
          query.pdfColumns !== undefined && query.pdfColumns !== null
            ? query.pdfColumns
            : 1;
        const pdfRowsPerPageRaw =
          query.pdfRowsPerPage !== undefined &&
          query.pdfRowsPerPage !== null
            ? query.pdfRowsPerPage
            : 10;
        const pdfRowsPerPage =
          Number.isFinite(pdfRowsPerPageRaw as unknown as number)
            ? Number(pdfRowsPerPageRaw)
            : 10;
        const rowsClamp = Math.min(60, Math.max(3, Math.round(pdfRowsPerPage)));

        const pdfLayout: MatriculaPdfLayoutOptions = {
          orientation:
            pdfOrientation === MatriculaPdfOrientation.portrait
              ? 'portrait'
              : 'landscape',
          columns: pdfColumns === 2 ? 2 : 1,
          rowsPerColumn: rowsClamp,
        };

        const photoPx = computeMatriculaPdfPhotoPxForResize(pdfLayout);

        const pdfRows = await Promise.all(
          (data as MatriculaPdfExportRow[]).map(async (m) => {
            if (m.pessoa?.PESFotoBase64) {
              const resized = await resizeBase64Image(
                m.pessoa.PESFotoBase64,
                photoPx,
                photoPx,
              );
              return {
                ...m,
                pessoa: { ...m.pessoa, PESFotoBase64: resized },
              };
            }
            return m;
          }),
        );
        buffer = await buildPdfBuffer(pdfRows, pdfLayout);
        contentType = 'application/pdf';
        break;
      }
    }

    const filename = `matriculas-${stamp}.${exportFormat}`;
    return { buffer, filename, contentType };
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
