import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../common/dto/pagination.dto';
import {
  ExportRegistroDiarioQueryDto,
  QueryRegistroDiarioDto,
  RegistroDiarioExportFormat,
} from './dto/registro-diario.dto';
import { parseIsoDateOnlyToUtcNoon } from '../common/utils/date-only.utils';
import { resizeBase64Image } from '../common/utils/image.utils';
import { format as formatDate } from 'date-fns';
import {
  REPORT_CONTENT_TYPES,
  formatIsoDateOnly,
  loadFotosJpeg,
} from '../common/export/relatorio-export.utils';
import {
  REGISTRO_DIARIO_PDF_FOTO_PX,
  buildRegistroDiarioCsvBuffer,
  buildRegistroDiarioPdfBuffer,
  buildRegistroDiarioXlsxBuffer,
  type RegistroDiarioExportContext,
  type RegistroDiarioExportRow,
} from './registro-diario-export.builder';

const MAX_EXPORT_ROWS = 50_000;
/** PDF embute foto por linha; limite menor para manter tempo/tamanho aceitáveis. */
const MAX_EXPORT_ROWS_PDF = 5_000;

@Injectable()
export class RegistroDiarioService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filtros compartilhados entre a listagem paginada e a exportação. */
  private buildWhere(
    instituicaoCodigo: number,
    query: QueryRegistroDiarioDto,
  ): Prisma.RPDRegistrosDiariosWhereInput {
    const { PESCodigo, nome, documento, grupo, MATCurso, MATSerie, MATTurma, dataInicio, dataFim } = query;

    const pessoaWhere: Prisma.PESPessoaWhereInput = {};
    if (nome) pessoaWhere.PESNome = { contains: nome, mode: 'insensitive' };
    if (documento) pessoaWhere.PESDocumento = { contains: documento, mode: 'insensitive' };
    if (grupo) pessoaWhere.PESGrupo = grupo;

    const matriculaWhere: Prisma.MATMatriculaWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
      MATAtivo: true,
    };
    if (MATCurso?.length) matriculaWhere.MATCurso = { in: MATCurso };
    if (MATSerie?.length) matriculaWhere.MATSerie = { in: MATSerie };
    if (MATTurma?.length) matriculaWhere.MATTurma = { in: MATTurma };

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
    const hasMatriculaFilter = MATCurso?.length || MATSerie?.length || MATTurma?.length;

    if (hasPessoaFilter || hasMatriculaFilter) {
      where.pessoa = { ...pessoaWhere };
      if (hasMatriculaFilter) {
        where.pessoa.matriculas = { some: matriculaWhere };
      }
    }
    return where;
  }

  async findAll(
    instituicaoCodigo: number,
    query: QueryRegistroDiarioDto,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(instituicaoCodigo, query);

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
          usuarioCriacao: { select: { USRCodigo: true, USRNome: true } },
          usuarioAlteracao: { select: { USRCodigo: true, USRNome: true } },
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

  async exportRegistros(
    instituicaoCodigo: number,
    query: ExportRegistroDiarioQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const where = this.buildWhere(instituicaoCodigo, query);
    const isPdf = query.format === RegistroDiarioExportFormat.pdf;
    const max = isPdf ? MAX_EXPORT_ROWS_PDF : MAX_EXPORT_ROWS;

    const total = await this.prisma.rls.rPDRegistrosDiarios.count({ where });
    if (total > max) {
      throw new PayloadTooLargeException(
        `Exportação ${isPdf ? 'em PDF ' : ''}limitada a ${max} registros (${total} encontrados). Aplique filtros (ex.: período) para reduzir o resultado.`,
      );
    }

    const [instituicao, periodos, data] = await Promise.all([
      this.prisma.iNSInstituicao.findUnique({
        where: { INSCodigo: instituicaoCodigo },
        select: {
          INSNome: true,
          INSFusoHorario: true,
          INSAglutinacaoRegistros: true,
          INSAglutinacaoAutoCompletePeriodo: true,
        },
      }),
      this.prisma.pERPeriodosConfig.findMany({
        where: { INSInstituicaoCodigo: instituicaoCodigo },
        orderBy: { PERHorarioInicio: 'asc' },
        select: {
          PERNome: true,
          PERHorarioInicio: true,
          PERHorarioFim: true,
          PERToleranciaEntradaMinutos: true,
          PERToleranciaSaidaMinutos: true,
        },
      }),
      this.prisma.rls.rPDRegistrosDiarios.findMany({
        where,
        orderBy: [{ RPDData: 'desc' }, { RPDCodigo: 'desc' }],
        select: {
          RPDData: true,
          RPDJanelaIndice: true,
          RPDDataEntrada: true,
          RPDDataSaida: true,
          RPDStatus: true,
          RPDAlteradoEm: true,
          periodo: { select: { PERNome: true } },
          pessoa: {
            select: {
              PESCodigo: true,
              PESNome: true,
              PESNomeSocial: true,
              PESDocumento: true,
              PESGrupo: true,
              matriculas: {
                where: { INSInstituicaoCodigo: instituicaoCodigo, MATAtivo: true },
                orderBy: { MATCodigo: 'desc' },
                take: 1,
                select: { MATNumero: true, MATCurso: true, MATSerie: true, MATTurma: true },
              },
            },
          },
          usuarioCriacao: { select: { USRNome: true } },
          usuarioAlteracao: { select: { USRNome: true } },
        },
      }),
    ]);
    if (!instituicao) {
      throw new NotFoundException('Instituição não encontrada');
    }

    const rows = data as RegistroDiarioExportRow[];
    const geradoEm = new Date();
    const ctx: RegistroDiarioExportContext = {
      instituicaoNome: instituicao.INSNome,
      fusoHorario: instituicao.INSFusoHorario ?? -3,
      geradoEm,
      filtrosDescricao: this.describeFiltros(query),
      aglutinacao: {
        tipo: instituicao.INSAglutinacaoRegistros,
        autoCompletePeriodo: instituicao.INSAglutinacaoAutoCompletePeriodo,
        periodos,
      },
    };

    let buffer: Buffer;
    switch (query.format) {
      case RegistroDiarioExportFormat.csv:
        buffer = buildRegistroDiarioCsvBuffer(rows, ctx);
        break;
      case RegistroDiarioExportFormat.xlsx:
        buffer = await buildRegistroDiarioXlsxBuffer(rows, ctx);
        break;
      case RegistroDiarioExportFormat.pdf: {
        const fotos = await loadFotosJpeg(
          rows.map((r) => r.pessoa.PESCodigo),
          REGISTRO_DIARIO_PDF_FOTO_PX,
          (ids) =>
            this.prisma.rls.pESPessoa.findMany({
              where: {
                INSInstituicaoCodigo: instituicaoCodigo,
                PESCodigo: { in: ids },
                PESFotoBase64: { not: null },
              },
              select: { PESCodigo: true, PESFotoBase64: true },
            }),
        );
        buffer = await buildRegistroDiarioPdfBuffer(rows, fotos, ctx);
        break;
      }
    }

    const stamp = formatDate(geradoEm, 'yyyyMMdd-HHmm');
    return {
      buffer,
      filename: `registros-${stamp}.${query.format}`,
      contentType: REPORT_CONTENT_TYPES[query.format],
    };
  }

  private describeFiltros(q: QueryRegistroDiarioDto): string[] {
    const out: string[] = [];
    if (q.dataInicio && q.dataFim) {
      out.push(`Período: ${formatIsoDateOnly(q.dataInicio)} a ${formatIsoDateOnly(q.dataFim)}`);
    } else if (q.dataInicio) {
      out.push(`A partir de: ${formatIsoDateOnly(q.dataInicio)}`);
    } else if (q.dataFim) {
      out.push(`Até: ${formatIsoDateOnly(q.dataFim)}`);
    }
    if (q.nome) out.push(`Nome: ${q.nome}`);
    if (q.documento) out.push(`Documento: ${q.documento}`);
    if (q.grupo) out.push(`Grupo: ${q.grupo}`);
    if (q.MATCurso?.length) out.push(`Curso: ${q.MATCurso.join(', ')}`);
    if (q.MATSerie?.length) out.push(`Série: ${q.MATSerie.join(', ')}`);
    if (q.MATTurma?.length) out.push(`Turma: ${q.MATTurma.join(', ')}`);
    return out;
  }
}
