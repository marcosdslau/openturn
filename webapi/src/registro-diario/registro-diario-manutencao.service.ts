import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { parseIsoDateOnlyToUtcNoon, addUtcCalendarDays } from '../common/utils/date-only.utils';
import { Prisma, RPDStatus } from '@prisma/client';
import {
  ReprocessarPeriodoDto,
  QueryManutencaoRegistroDiarioDto,
  ManutencaoFiltrosDto,
  CriarManualRegistroDiarioDto,
  AlterarRegistrosDiariosDto,
  ExcluirRegistrosDiariosDto,
  UpdateRegistroDiarioDto,
} from './dto/registro-diario-manutencao.dto';

@Injectable()
export class RegistroDiarioManutencaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rotinaQueue: RotinaQueueService,
  ) {}

  // ---------------------------------------------------------------------------
  // Sync manual
  // ---------------------------------------------------------------------------

  async triggerSync(instituicaoCodigo: number): Promise<{ jobId: string }> {
    const jobId = await this.rotinaQueue.publishRegistroDiarioSyncJob(instituicaoCodigo);
    return { jobId };
  }

  // ---------------------------------------------------------------------------
  // Reprocessar período
  // ---------------------------------------------------------------------------

  async reprocessarPeriodo(
    instituicaoCodigo: number,
    dto: ReprocessarPeriodoDto,
  ): Promise<{ jobId: string; rpdRemovidos: number; passagensResetadas: number }> {
    const inicio = parseIsoDateOnlyToUtcNoon(dto.dataInicio);
    const fim = parseIsoDateOnlyToUtcNoon(dto.dataFim);

    if (inicio > fim) {
      throw new BadRequestException('dataInicio deve ser anterior ou igual a dataFim');
    }

    // Limitar a 366 dias para evitar operações excessivas
    const diffDias = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDias > 366) {
      throw new BadRequestException('Intervalo máximo de reprocessamento é 366 dias');
    }

    // Início do dia civil (00:00 UTC) e fim do dia civil (23:59:59 UTC) para filtrar REGDataHora
    const inicioDate = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate(), 0, 0, 0));
    const fimDate = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate(), 23, 59, 59, 999));

    let rpdRemovidos = 0;
    let passagensResetadas = 0;

    await this.prisma.$transaction(async (tx) => {
      const deleteResult = await tx.rPDRegistrosDiarios.deleteMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          RPDData: { gte: inicio, lte: fim },
        },
      });
      rpdRemovidos = deleteResult.count;

      const updateResult = await tx.rEGRegistroPassagem.updateMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          REGDataHora: { gte: inicioDate, lte: fimDate },
          REGProcessado: true,
        },
        data: { REGProcessado: false },
      });
      passagensResetadas = updateResult.count;
    });

    const jobId = await this.rotinaQueue.publishRegistroDiarioSyncJob(instituicaoCodigo);

    return { jobId, rpdRemovidos, passagensResetadas };
  }

  // ---------------------------------------------------------------------------
  // Listagem avançada de manutenção
  // ---------------------------------------------------------------------------

  async findManutencao(
    instituicaoCodigo: number,
    query: QueryManutencaoRegistroDiarioDto,
  ): Promise<PaginatedResult<any>> {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const where = this.buildManutencaoWhere(instituicaoCodigo, query);

    const [data, total] = await Promise.all([
      this.prisma.rls.rPDRegistrosDiarios.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ RPDData: 'desc' }, { PESCodigo: 'asc' }, { RPDJanelaIndice: 'asc' }],
        include: {
          pessoa: {
            select: {
              PESCodigo: true,
              PESNome: true,
              PESNomeSocial: true,
              PESDocumento: true,
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
          periodo: { select: { PERCodigo: true, PERNome: true } },
        },
      }),
      this.prisma.rls.rPDRegistrosDiarios.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private buildManutencaoWhere(
    instituicaoCodigo: number,
    filtros: ManutencaoFiltrosDto,
  ): Prisma.RPDRegistrosDiariosWhereInput {
    const where: Prisma.RPDRegistrosDiariosWhereInput = {
      INSInstituicaoCodigo: instituicaoCodigo,
    };

    if (filtros.pessoasCodigos?.length) {
      where.PESCodigo = { in: filtros.pessoasCodigos };
    }

    if (filtros.dataHoraInicio || filtros.dataHoraFim) {
      where.RPDDataEntrada = {};
      if (filtros.dataHoraInicio) where.RPDDataEntrada.gte = new Date(filtros.dataHoraInicio);
      if (filtros.dataHoraFim) where.RPDDataEntrada.lte = new Date(filtros.dataHoraFim);
    }

    if (filtros.entradasVazias) where.RPDDataEntrada = null;
    if (filtros.saidasVazias) where.RPDDataSaida = null;

    const hasMatriculaFilter = filtros.MATCurso?.length || filtros.MATSerie?.length || filtros.MATTurma?.length;
    if (hasMatriculaFilter) {
      const matriculaWhere: Prisma.MATMatriculaWhereInput = {
        INSInstituicaoCodigo: instituicaoCodigo,
        MATAtivo: true,
      };
      if (filtros.MATCurso?.length) matriculaWhere.MATCurso = { in: filtros.MATCurso };
      if (filtros.MATSerie?.length) matriculaWhere.MATSerie = { in: filtros.MATSerie };
      if (filtros.MATTurma?.length) matriculaWhere.MATTurma = { in: filtros.MATTurma };
      where.pessoa = { matriculas: { some: matriculaWhere } };
    }

    return where;
  }

  // ---------------------------------------------------------------------------
  // Preview de criação manual
  // ---------------------------------------------------------------------------

  async previewCriacaoManual(
    instituicaoCodigo: number,
    filtros: ManutencaoFiltrosDto,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<any>> {
    const { pessoasCodigos, dias } = await this.resolverPessoasDias(instituicaoCodigo, filtros);

    const allPairs: { pesCodigo: number; rpdData: Date }[] = [];
    for (const pesCodigo of pessoasCodigos) {
      for (const dia of dias) {
        allPairs.push({ pesCodigo, rpdData: dia });
      }
    }

    const total = allPairs.length;
    const skip = (page - 1) * limit;
    const pagePairs = allPairs.slice(skip, skip + limit);

    if (pagePairs.length === 0) {
      return { data: [], meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    // Buscar RPDs existentes para o conjunto paginado
    const existingRpds = await this.prisma.rls.rPDRegistrosDiarios.findMany({
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        OR: pagePairs.map(p => ({ PESCodigo: p.pesCodigo, RPDData: p.rpdData })),
      },
      select: { PESCodigo: true, RPDData: true, RPDCodigo: true },
    });

    const existingMap = new Map<string, number>();
    for (const r of existingRpds) {
      existingMap.set(`${r.PESCodigo}_${r.RPDData.toISOString()}`, r.RPDCodigo);
    }

    const pessoas = await this.prisma.rls.pESPessoa.findMany({
      where: { PESCodigo: { in: pagePairs.map(p => p.pesCodigo) } },
      select: { PESCodigo: true, PESNome: true, PESNomeSocial: true },
    });
    const pessoaMap = new Map(pessoas.map(p => [p.PESCodigo, p]));

    const data = pagePairs.map(pair => {
      const key = `${pair.pesCodigo}_${pair.rpdData.toISOString()}`;
      const rpdCodigo = existingMap.get(key);
      return {
        pessoa: pessoaMap.get(pair.pesCodigo),
        RPDData: pair.rpdData,
        RPDCodigo: rpdCodigo ?? null,
        acao: rpdCodigo ? 'substituir' : 'criar',
      };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ---------------------------------------------------------------------------
  // Criar manual
  // ---------------------------------------------------------------------------

  async criarManual(
    instituicaoCodigo: number,
    dto: CriarManualRegistroDiarioDto,
    userId: number,
  ): Promise<{
    pessoas: number;
    dias: number;
    janelasPorDia: number;
    rpdCriados: number;
    rpdSubstituidos: number;
    passagensMarcadas: number;
  }> {
    const { filtros, janelasDesejadas } = dto;

    const instituicao = await this.prisma.rls.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: { INSFusoHorario: true },
    });
    if (!instituicao) throw new NotFoundException('Instituição não encontrada');

    const fuso = instituicao.INSFusoHorario;
    const { pessoasCodigos, dias } = await this.resolverPessoasDias(instituicaoCodigo, filtros);

    if (pessoasCodigos.length === 0 || dias.length === 0) {
      return { pessoas: 0, dias: 0, janelasPorDia: janelasDesejadas.length, rpdCriados: 0, rpdSubstituidos: 0, passagensMarcadas: 0 };
    }

    // Calcular intervalo de passagens para marcar como processadas
    const primeirosDia = dias[0];
    const ultimoDia = dias[dias.length - 1];
    const passagensInicio = new Date(Date.UTC(primeirosDia.getUTCFullYear(), primeirosDia.getUTCMonth(), primeirosDia.getUTCDate(), 0, 0, 0));
    const passagensFim = new Date(Date.UTC(ultimoDia.getUTCFullYear(), ultimoDia.getUTCMonth(), ultimoDia.getUTCDate(), 23, 59, 59, 999));

    let rpdCriados = 0;
    let rpdSubstituidos = 0;
    let passagensMarcadas = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const dia of dias) {
        for (const pesCodigo of pessoasCodigos) {
          // Contar RPDs existentes antes de deletar (para estatísticas)
          const existentes = await tx.rPDRegistrosDiarios.count({
            where: { INSInstituicaoCodigo: instituicaoCodigo, PESCodigo: pesCodigo, RPDData: dia },
          });

          // Substituir: apagar todos do dia/pessoa
          if (existentes > 0) {
            await tx.rPDRegistrosDiarios.deleteMany({
              where: { INSInstituicaoCodigo: instituicaoCodigo, PESCodigo: pesCodigo, RPDData: dia },
            });
            rpdSubstituidos += existentes;
          }

          // Inserir N janelas
          const inserts = janelasDesejadas.map((janela, idx) => {
            const entrada = buildDatetimeFromDiaHora(dia, janela.horaEntrada, fuso);
            const saida = buildDatetimeFromDiaHora(dia, janela.horaSaida, fuso);
            return tx.rPDRegistrosDiarios.create({
              data: {
                INSInstituicaoCodigo: instituicaoCodigo,
                PESCodigo: pesCodigo,
                RPDData: dia,
                RPDJanelaIndice: idx + 1,
                RPDDataEntrada: entrada,
                RPDDataSaida: saida,
                RPDStatus: RPDStatus.MANUAL,
                USRCodigoCriacao: userId,
              },
            });
          });
          await Promise.all(inserts);
          rpdCriados += janelasDesejadas.length;
        }
      }

      // Marcar passagens como processadas no intervalo
      const passagensResult = await tx.rEGRegistroPassagem.updateMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          PESCodigo: { in: pessoasCodigos },
          REGDataHora: { gte: passagensInicio, lte: passagensFim },
          REGProcessado: false,
        },
        data: { REGProcessado: true },
      });
      passagensMarcadas = passagensResult.count;
    });

    return {
      pessoas: pessoasCodigos.length,
      dias: dias.length,
      janelasPorDia: janelasDesejadas.length,
      rpdCriados,
      rpdSubstituidos,
      passagensMarcadas,
    };
  }

  // ---------------------------------------------------------------------------
  // Excluir em lote
  // ---------------------------------------------------------------------------

  async excluirBulk(
    instituicaoCodigo: number,
    dto: ExcluirRegistrosDiariosDto,
  ): Promise<{ excluidos: number }> {
    const result = await this.prisma.rls.rPDRegistrosDiarios.deleteMany({
      where: {
        RPDCodigo: { in: dto.rpdCodigos },
        INSInstituicaoCodigo: instituicaoCodigo,
      },
    });
    return { excluidos: result.count };
  }

  // ---------------------------------------------------------------------------
  // Alterar em lote
  // ---------------------------------------------------------------------------

  async alterarBulk(
    instituicaoCodigo: number,
    dto: AlterarRegistrosDiariosDto,
    userId: number,
  ): Promise<{ alterados: number }> {
    const base: Prisma.RPDRegistrosDiariosUncheckedUpdateManyInput = {
      RPDStatus: RPDStatus.MANUAL,
      USRCodigoAlteracao: userId,
      RPDAlteradoEm: new Date(),
    };

    const usarHoraEntrada = dto.alterarEntrada && !!dto.novaEntradaHora;
    const usarHoraSaida = dto.alterarSaida && !!dto.novaSaidaHora;
    const usarIsoEntrada = dto.alterarEntrada && !!dto.novaEntrada;
    const usarIsoSaida = dto.alterarSaida && !!dto.novaSaida;

    if (!usarHoraEntrada && !usarHoraSaida) {
      const data: Prisma.RPDRegistrosDiariosUncheckedUpdateManyInput = { ...base };
      if (usarIsoEntrada) data.RPDDataEntrada = new Date(dto.novaEntrada!);
      if (usarIsoSaida) data.RPDDataSaida = new Date(dto.novaSaida!);

      const result = await this.prisma.rls.rPDRegistrosDiarios.updateMany({
        where: {
          RPDCodigo: { in: dto.rpdCodigos },
          INSInstituicaoCodigo: instituicaoCodigo,
        },
        data,
      });
      return { alterados: result.count };
    }

    const inst = await this.prisma.rls.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: { INSFusoHorario: true },
    });
    const fusoHorario = inst?.INSFusoHorario ?? -3;

    const rows = await this.prisma.rls.rPDRegistrosDiarios.findMany({
      where: {
        RPDCodigo: { in: dto.rpdCodigos },
        INSInstituicaoCodigo: instituicaoCodigo,
      },
      select: { RPDCodigo: true, RPDData: true },
    });

    const byDay = new Map<number, number[]>();
    for (const r of rows) {
      const key = r.RPDData.getTime();
      const list = byDay.get(key);
      if (list) list.push(r.RPDCodigo);
      else byDay.set(key, [r.RPDCodigo]);
    }

    let alterados = 0;
    for (const [dayKey, codigos] of byDay.entries()) {
      const dia = new Date(dayKey);
      const data: Prisma.RPDRegistrosDiariosUncheckedUpdateManyInput = { ...base };
      if (usarHoraEntrada) {
        data.RPDDataEntrada = buildDatetimeFromDiaHora(dia, dto.novaEntradaHora!, fusoHorario);
      } else if (usarIsoEntrada) {
        data.RPDDataEntrada = new Date(dto.novaEntrada!);
      }
      if (usarHoraSaida) {
        data.RPDDataSaida = buildDatetimeFromDiaHora(dia, dto.novaSaidaHora!, fusoHorario);
      } else if (usarIsoSaida) {
        data.RPDDataSaida = new Date(dto.novaSaida!);
      }

      const result = await this.prisma.rls.rPDRegistrosDiarios.updateMany({
        where: {
          RPDCodigo: { in: codigos },
          INSInstituicaoCodigo: instituicaoCodigo,
        },
        data,
      });
      alterados += result.count;
    }

    return { alterados };
  }

  // ---------------------------------------------------------------------------
  // Edição unitária
  // ---------------------------------------------------------------------------

  async updateOne(
    rpdCodigo: number,
    instituicaoCodigo: number,
    dto: UpdateRegistroDiarioDto,
    userId: number,
  ) {
    await this.assertOwnership(rpdCodigo, instituicaoCodigo);

    return this.prisma.rls.rPDRegistrosDiarios.update({
      where: { RPDCodigo: rpdCodigo },
      data: {
        ...(dto.RPDDataEntrada !== undefined && { RPDDataEntrada: new Date(dto.RPDDataEntrada) }),
        ...(dto.RPDDataSaida !== undefined && { RPDDataSaida: new Date(dto.RPDDataSaida) }),
        RPDStatus: RPDStatus.MANUAL,
        USRCodigoAlteracao: userId,
        RPDAlteradoEm: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Exclusão unitária
  // ---------------------------------------------------------------------------

  async deleteOne(rpdCodigo: number, instituicaoCodigo: number): Promise<void> {
    await this.assertOwnership(rpdCodigo, instituicaoCodigo);
    await this.prisma.rls.rPDRegistrosDiarios.delete({ where: { RPDCodigo: rpdCodigo } });
  }

  // ---------------------------------------------------------------------------
  // Helpers internos
  // ---------------------------------------------------------------------------

  private async assertOwnership(rpdCodigo: number, instituicaoCodigo: number) {
    const rpd = await this.prisma.rls.rPDRegistrosDiarios.findFirst({
      where: { RPDCodigo: rpdCodigo, INSInstituicaoCodigo: instituicaoCodigo },
      select: { RPDCodigo: true },
    });
    if (!rpd) throw new NotFoundException(`RPD ${rpdCodigo} não encontrado`);
  }

  /**
   * Resolve o conjunto de pessoasCodigos e dias civis (UTC noon) a partir dos filtros.
   * Requer dataHoraInicio e dataHoraFim nos filtros para determinar o range.
   */
  private async resolverPessoasDias(
    instituicaoCodigo: number,
    filtros: ManutencaoFiltrosDto,
  ): Promise<{ pessoasCodigos: number[]; dias: Date[] }> {
    if (!filtros.dataHoraInicio || !filtros.dataHoraFim) {
      throw new BadRequestException('filtros.dataHoraInicio e filtros.dataHoraFim são obrigatórios para criação manual');
    }

    const inicio = new Date(filtros.dataHoraInicio);
    const fim = new Date(filtros.dataHoraFim);

    if (inicio > fim) {
      throw new BadRequestException('dataHoraInicio deve ser anterior ou igual a dataHoraFim');
    }

    // Enumerar dias civis no range
    const dias: Date[] = [];
    const inicioNoon = parseIsoDateOnlyToUtcNoon(filtros.dataHoraInicio.split('T')[0]);
    const fimNoon = parseIsoDateOnlyToUtcNoon(filtros.dataHoraFim.split('T')[0]);

    let cur = inicioNoon;
    const MAX_DAYS = 366;
    let count = 0;
    while (cur <= fimNoon && count < MAX_DAYS) {
      dias.push(cur);
      cur = addUtcCalendarDays(cur, 1);
      count++;
    }

    // Resolver pessoas
    let pessoasCodigos: number[] = [];

    if (filtros.pessoasCodigos?.length) {
      pessoasCodigos = filtros.pessoasCodigos;
    } else {
      const hasMatriculaFilter = filtros.MATCurso?.length || filtros.MATSerie?.length || filtros.MATTurma?.length;
      const matriculaWhere: Prisma.MATMatriculaWhereInput = {
        INSInstituicaoCodigo: instituicaoCodigo,
        MATAtivo: true,
      };
      if (filtros.MATCurso?.length) matriculaWhere.MATCurso = { in: filtros.MATCurso };
      if (filtros.MATSerie?.length) matriculaWhere.MATSerie = { in: filtros.MATSerie };
      if (filtros.MATTurma?.length) matriculaWhere.MATTurma = { in: filtros.MATTurma };

      const pessoas = await this.prisma.rls.pESPessoa.findMany({
        where: hasMatriculaFilter
          ? { matriculas: { some: matriculaWhere } }
          : { matriculas: { some: { INSInstituicaoCodigo: instituicaoCodigo, MATAtivo: true } } },
        select: { PESCodigo: true },
      });
      pessoasCodigos = pessoas.map(p => p.PESCodigo);
    }

    return { pessoasCodigos, dias };
  }
}

/**
 * Combina uma data (RPDData — UTC noon) com uma hora local "HH:mm" e offset de fuso
 * para gerar um datetime UTC completo.
 *
 * fusoHorario = offset da instituição em horas (ex.: -3 para Brasília).
 * UTC = local - fuso  →  hour_utc = hour_local - fusoHorario
 */
function buildDatetimeFromDiaHora(dia: Date, horaLocal: string, fusoHorario: number): Date {
  const [h, m] = horaLocal.split(':').map(Number);
  const utcHours = h - fusoHorario;
  return new Date(
    Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), utcHours, m, 0, 0),
  );
}
