import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreatePassagemDto,
  ExportPassagemQueryDto,
  PassagemExportFormat,
  QueryPassagemDto,
  UpdatePassagemDto,
} from './dto/passagem.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { resizeBase64Image } from '../common/utils/image.utils';
import { format as formatDate } from 'date-fns';
import {
  PASSAGEM_PDF_FOTO_PX,
  buildPassagemCsvBuffer,
  buildPassagemPdfBuffer,
  buildPassagemXlsxBuffer,
  type PassagemExportContext,
  type PassagemExportRow,
} from './registro-passagem-export.builder';
import {
  REPORT_CONTENT_TYPES,
  formatIsoDateOnly,
  loadFotosJpeg,
} from '../common/export/relatorio-export.utils';

const MAX_EXPORT_ROWS = 50_000;
/** PDF embute foto por linha; limite menor para manter tempo/tamanho aceitáveis. */
const MAX_EXPORT_ROWS_PDF = 5_000;

@Injectable()
export class RegistroPassagemService {
  constructor(private prisma: PrismaService) {}

  private isValidDate(d: Date) {
    return !Number.isNaN(d.getTime());
  }

  private parseDateStart(value: string): Date | null {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]);
      const day = Number(dateOnly[3]);
      const d = new Date(year, month - 1, day, 0, 0, 0, 0);
      return this.isValidDate(d) ? d : null;
    }
    const d = new Date(value);
    return this.isValidDate(d) ? d : null;
  }

  private parseDateEnd(value: string): Date | null {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]);
      const day = Number(dateOnly[3]);
      const d = new Date(year, month - 1, day, 23, 59, 59, 999);
      return this.isValidDate(d) ? d : null;
    }
    const d = new Date(value);
    return this.isValidDate(d) ? d : null;
  }

  async create(instituicaoCodigo: number, dto: CreatePassagemDto) {
    const now = new Date();
    return this.prisma.rls.rEGRegistroPassagem.create({
      data: {
        PESCodigo: dto.PESCodigo,
        REGAcao: dto.REGAcao,
        EQPCodigo: dto.EQPCodigo,
        REGTimestamp: BigInt(Math.floor(now.getTime() / 1000)),
        REGDataHora: now,
        INSInstituicaoCodigo: instituicaoCodigo,
      },
    });
  }

  async update(instituicaoCodigo: number, id: number, dto: UpdatePassagemDto) {
    const existing = await this.prisma.rls.rEGRegistroPassagem.findFirst({
      where: { REGCodigo: id, INSInstituicaoCodigo: instituicaoCodigo },
    });
    if (!existing) {
      throw new NotFoundException('Passagem não encontrada');
    }
    const data: Prisma.REGRegistroPassagemUpdateInput = {};
    if (dto.REGAcao !== undefined) data.REGAcao = dto.REGAcao;
    if (dto.EQPCodigo !== undefined) {
      data.equipamento = { connect: { EQPCodigo: dto.EQPCodigo } };
    }
    if (dto.PESCodigo !== undefined) {
      data.pessoa = { connect: { PESCodigo: dto.PESCodigo } };
    }
    if (dto.REGDataHora !== undefined) {
      const d = new Date(dto.REGDataHora);
      if (!this.isValidDate(d)) {
        throw new BadRequestException('REGDataHora inválida');
      }
      data.REGDataHora = d;
      data.REGTimestamp = BigInt(Math.floor(d.getTime() / 1000));
    }
    return this.prisma.rls.rEGRegistroPassagem.update({
      where: { REGCodigo: id },
      data,
    });
  }

  async remove(instituicaoCodigo: number, id: number) {
    const existing = await this.prisma.rls.rEGRegistroPassagem.findFirst({
      where: { REGCodigo: id, INSInstituicaoCodigo: instituicaoCodigo },
    });
    if (!existing) {
      throw new NotFoundException('Passagem não encontrada');
    }
    return this.prisma.rls.rEGRegistroPassagem.delete({
      where: { REGCodigo: id },
    });
  }

  /** Filtros compartilhados entre a listagem paginada e a exportação. */
  private buildWhere(
    instituicaoCodigo: number,
    query: QueryPassagemDto,
  ): Prisma.REGRegistroPassagemWhereInput {
    const {
      PESCodigo,
      EQPCodigo,
      dataInicio,
      dataFim,
      REGAcao,
      nome,
      documento,
      email,
      grupo,
      cartaoTag,
      numero,
      curso,
      serie,
      turma,
    } = query;

    const where: Prisma.REGRegistroPassagemWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
    };
    if (PESCodigo) where.PESCodigo = PESCodigo;
    if (EQPCodigo) where.EQPCodigo = EQPCodigo;
    if (REGAcao) where.REGAcao = REGAcao;
    if (dataInicio || dataFim) {
      const regDataHora: Prisma.DateTimeFilter = {};
      if (dataInicio) {
        const gte = this.parseDateStart(dataInicio);
        if (!gte) throw new BadRequestException('dataInicio inválida');
        regDataHora.gte = gte;
      }
      if (dataFim) {
        const lte = this.parseDateEnd(dataFim);
        if (!lte) throw new BadRequestException('dataFim inválida');
        regDataHora.lte = lte;
      }
      if (regDataHora.gte && regDataHora.lte && regDataHora.gte > regDataHora.lte) {
        throw new BadRequestException('Intervalo de datas inválido (dataInicio > dataFim)');
      }
      where.REGDataHora = regDataHora;
    }

    const pessoaWhere: Prisma.PESPessoaWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
    };
    if (nome) {
      pessoaWhere.OR = [
        { PESNome: { contains: nome, mode: 'insensitive' } },
        { PESNomeSocial: { contains: nome, mode: 'insensitive' } },
      ];
    }
    if (documento) {
      pessoaWhere.PESDocumento = { contains: documento, mode: 'insensitive' };
    }
    if (email) {
      pessoaWhere.PESEmail = { contains: email, mode: 'insensitive' };
    }
    if (grupo) {
      pessoaWhere.PESGrupo = { equals: grupo, mode: 'insensitive' };
    }
    if (cartaoTag) {
      pessoaWhere.PESCartaoTag = { contains: cartaoTag, mode: 'insensitive' };
    }

    const hasMatriculaFilter =
      !!numero?.trim() ||
      (curso?.length ?? 0) > 0 ||
      (serie?.length ?? 0) > 0 ||
      (turma?.length ?? 0) > 0;
    if (hasMatriculaFilter) {
      const matriculaWhere: Prisma.MATMatriculaWhereInput = {
        INSInstituicaoCodigo: instituicaoCodigo,
        MATAtivo: true,
      };
      if (numero) {
        matriculaWhere.MATNumero = { contains: numero, mode: 'insensitive' };
      }
      if (curso?.length) matriculaWhere.MATCurso = { in: curso };
      if (serie?.length) matriculaWhere.MATSerie = { in: serie };
      if (turma?.length) matriculaWhere.MATTurma = { in: turma };
      pessoaWhere.matriculas = { some: matriculaWhere };
    }

    const hasPessoaFilter =
      !!nome ||
      !!documento ||
      !!email ||
      !!grupo ||
      !!cartaoTag ||
      hasMatriculaFilter;
    if (hasPessoaFilter) {
      where.pessoa = { is: pessoaWhere };
    }
    return where;
  }

  async findAll(
    instituicaoCodigo: number,
    query: QueryPassagemDto,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(instituicaoCodigo, query);

    const [data, total] = await Promise.all([
      this.prisma.rls.rEGRegistroPassagem.findMany({
        where,
        skip,
        take: limit,
        include: {
          pessoa: {
            select: {
              PESCodigo: true,
              PESNome: true,
              PESDocumento: true,
              PESFotoBase64: true,
              PESFotoExtensao: true,
            },
          },
          equipamento: { select: { EQPCodigo: true, EQPDescricao: true } },
        },
        orderBy: { REGDataHora: 'desc' },
      }),
      this.prisma.rls.rEGRegistroPassagem.count({ where }),
    ]);

    const serialized = await Promise.all(
      data.map(async (d: any) => {
        const pes = d.pessoa;
        if (!pes) {
          return { ...d, REGTimestamp: Number(d.REGTimestamp) };
        }
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
          ...d,
          REGTimestamp: Number(d.REGTimestamp),
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

  async exportPassagens(
    instituicaoCodigo: number,
    query: ExportPassagemQueryDto,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const where = this.buildWhere(instituicaoCodigo, query);
    const isPdf = query.format === PassagemExportFormat.pdf;
    const max = isPdf ? MAX_EXPORT_ROWS_PDF : MAX_EXPORT_ROWS;

    const total = await this.prisma.rls.rEGRegistroPassagem.count({ where });
    if (total > max) {
      throw new PayloadTooLargeException(
        `Exportação ${isPdf ? 'em PDF ' : ''}limitada a ${max} passagens (${total} encontradas). Aplique filtros (ex.: período) para reduzir o resultado.`,
      );
    }

    const [instituicao, data] = await Promise.all([
      this.prisma.iNSInstituicao.findUnique({
        where: { INSCodigo: instituicaoCodigo },
        select: { INSNome: true, INSFusoHorario: true },
      }),
      this.prisma.rls.rEGRegistroPassagem.findMany({
        where,
        select: {
          REGDataHora: true,
          REGAcao: true,
          pessoa: {
            select: {
              PESCodigo: true,
              PESNome: true,
              PESDocumento: true,
              PESGrupo: true,
            },
          },
          equipamento: {
            select: { EQPDescricao: true, EQPEnderecoIp: true },
          },
        },
        orderBy: { REGDataHora: 'desc' },
      }),
    ]);
    if (!instituicao) {
      throw new NotFoundException('Instituição não encontrada');
    }

    const rows = data as PassagemExportRow[];
    const geradoEm = new Date();
    const ctx: PassagemExportContext = {
      instituicaoNome: instituicao.INSNome,
      fusoHorario: instituicao.INSFusoHorario ?? -3,
      geradoEm,
      filtrosDescricao: this.describeFiltros(query),
    };

    let buffer: Buffer;
    switch (query.format) {
      case PassagemExportFormat.csv:
        buffer = buildPassagemCsvBuffer(rows, ctx);
        break;
      case PassagemExportFormat.xlsx:
        buffer = await buildPassagemXlsxBuffer(rows, ctx);
        break;
      case PassagemExportFormat.pdf: {
        const fotos = await loadFotosJpeg(
          rows.map((r) => r.pessoa?.PESCodigo).filter((id): id is number => !!id),
          PASSAGEM_PDF_FOTO_PX,
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
        buffer = await buildPassagemPdfBuffer(rows, fotos, ctx);
        break;
      }
    }

    const stamp = formatDate(geradoEm, 'yyyyMMdd-HHmm');
    return {
      buffer,
      filename: `passagens-${stamp}.${query.format}`,
      contentType: REPORT_CONTENT_TYPES[query.format],
    };
  }

  private describeFiltros(q: QueryPassagemDto): string[] {
    const fmtData = formatIsoDateOnly;
    const out: string[] = [];
    if (q.dataInicio && q.dataFim) {
      out.push(`Período: ${fmtData(q.dataInicio)} a ${fmtData(q.dataFim)}`);
    } else if (q.dataInicio) {
      out.push(`A partir de: ${fmtData(q.dataInicio)}`);
    } else if (q.dataFim) {
      out.push(`Até: ${fmtData(q.dataFim)}`);
    }
    if (q.REGAcao) out.push(`Ação: ${q.REGAcao === 'ENTRADA' ? 'Entrada' : 'Saída'}`);
    if (q.nome) out.push(`Nome: ${q.nome}`);
    if (q.documento) out.push(`Documento: ${q.documento}`);
    if (q.email) out.push(`E-mail: ${q.email}`);
    if (q.grupo) out.push(`Grupo: ${q.grupo}`);
    if (q.cartaoTag) out.push(`Cartão/tag: ${q.cartaoTag}`);
    if (q.numero) out.push(`Matrícula: ${q.numero}`);
    if (q.curso?.length) out.push(`Curso: ${q.curso.join(', ')}`);
    if (q.serie?.length) out.push(`Série: ${q.serie.join(', ')}`);
    if (q.turma?.length) out.push(`Turma: ${q.turma.join(', ')}`);
    return out;
  }
}
