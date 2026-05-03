import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RPDStatus } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import { IniciarLancamentoGenneraDto } from './dto/registro-diario.dto';
import {
  addUtcCalendarDays,
  parseIsoDateOnlyToUtcNoon,
} from '../common/utils/date-only.utils';

export interface GenneraJobStatus {
  status: 'running' | 'done' | 'error';
  percent: number;
  error?: string;
  total: number;
  processed: number;
}

const JOB_TTL_SEC = 3600;

@Injectable()
export class GenneraAttendanceService {
  private readonly logger = new Logger(GenneraAttendanceService.name);
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {
    try {
      this.redis = new Redis({ ...getRedisConnectionOptions(), lazyConnect: true });
      this.redis.connect().catch(() => { this.redis = null; });
    } catch {
      this.redis = null;
    }
  }

  private jobKey(jobId: string) {
    return `gennera:job:${jobId}`;
  }

  async getJobStatus(jobId: string): Promise<GenneraJobStatus | null> {
    if (!this.redis) return null;
    const raw = await this.redis.get(this.jobKey(jobId));
    if (!raw) return null;
    return JSON.parse(raw) as GenneraJobStatus;
  }

  private async setJobStatus(jobId: string, status: GenneraJobStatus) {
    if (!this.redis) return;
    await this.redis.set(this.jobKey(jobId), JSON.stringify(status), 'EX', JOB_TTL_SEC);
  }

  async iniciarLancamento(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
  ): Promise<void> {
    const erpConfig = await this.prisma.eRPConfiguracao.findFirst({
      where: { INSInstituicaoCodigo: instituicaoCodigo },
    });
    if (!erpConfig || !erpConfig.ERPUrlBase) {
      await this.setJobStatus(jobId, { status: 'error', percent: 0, total: 0, processed: 0, error: 'Configuração ERP não encontrada ou URL base ausente' });
      return;
    }

    const extraHeaders: Record<string, string> = (erpConfig.ERPConfigJson as any)?.headers ?? {};
    const axiosClient = axios.create({
      baseURL: erpConfig.ERPUrlBase,
      headers: {
        'x-access-token': `${erpConfig.ERPToken ?? ''}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });

    await this.setJobStatus(jobId, { status: 'running', percent: 0, total: 0, processed: 0 });

    // Processar de forma assíncrona sem bloquear o request
    setImmediate(() => {
      this.runLancamento(jobId, instituicaoCodigo, dto, axiosClient).catch((err) => {
        this.logger.error(`Falha no job Gennera ${jobId}`, err);
        this.setJobStatus(jobId, { status: 'error', percent: 100, total: 0, processed: 0, error: err?.message ?? String(err) });
      });
    });
  }

  private async runLancamento(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
  ) {
    /** YYYY-MM-DD sem deriva de dia ao persistir RPD em coluna DATE (meia-noite UTC → dia anterior no BR). */
    const dataInicio = parseIsoDateOnlyToUtcNoon(dto.dataInicio);
    const dataFim = parseIsoDateOnlyToUtcNoon(dto.dataFim);

    const dias: Date[] = [];
    let cur = new Date(dataInicio);
    const fimMs = dataFim.getTime();
    while (cur.getTime() <= fimMs) {
      dias.push(new Date(cur));
      cur = addUtcCalendarDays(cur, 1);
    }

    if (dto.considerarHorarioPassagens) {
      await this.lancamentoComHorario(jobId, instituicaoCodigo, dto, client, dias);
    } else {
      await this.lancamentoSemHorario(jobId, instituicaoCodigo, dto, client, dias);
    }
  }

  private async lancamentoComHorario(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
    dias: Date[],
  ) {
    const selecionadas = dto.pessoasCodigos && dto.pessoasCodigos.length > 0;

    // Buscar todas as pessoas ativas com PESIdExterno
    let pessoasAlvo: { PESCodigo: number; PESIdExterno: string | null }[] = [];
    if (selecionadas) {
      pessoasAlvo = await this.prisma.pESPessoa.findMany({
        where: { INSInstituicaoCodigo: instituicaoCodigo, PESCodigo: { in: dto.pessoasCodigos }, PESAtivo: true },
        select: { PESCodigo: true, PESIdExterno: true },
      });
    } else {
      pessoasAlvo = await this.prisma.pESPessoa.findMany({
        where: { INSInstituicaoCodigo: instituicaoCodigo, PESAtivo: true, deletedAt: null },
        select: { PESCodigo: true, PESIdExterno: true },
      });
    }

    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: {
        INSToleranciaEntradaMinutos: true,
        INSToleranciaSaidaMinutos: true,
      },
    });
    const tolEntradaMin = Math.max(0, inst?.INSToleranciaEntradaMinutos ?? 15);
    const tolSaidaMin = Math.max(0, inst?.INSToleranciaSaidaMinutos ?? 15);

    const total = dias.length * pessoasAlvo.length;
    let processed = 0;
    await this.setJobStatus(jobId, { status: 'running', percent: 0, total, processed });

    for (const dia of dias) {
      const registrosDia = await this.prisma.rPDRegistrosDiarios.findMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          RPDData: dia,
          ...(selecionadas ? { PESCodigo: { in: dto.pessoasCodigos } } : {}),
        },
      });

      const registrosPorPes = new Map(registrosDia.map((r) => [r.PESCodigo, r]));

      for (const pessoa of pessoasAlvo) {
        const reg = registrosPorPes.get(pessoa.PESCodigo);

        if (
          reg &&
          reg.RPDDataEntrada != null &&
          reg.RPDDataSaida != null
        ) {
          if (!pessoa.PESIdExterno) {
            await this.prisma.rPDRegistrosDiarios.update({
              where: { RPDCodigo: reg.RPDCodigo },
              data: { RPDStatus: RPDStatus.ERRO, RPDResult: { error: 'PESIdExterno não configurado' } },
            });
          } else {
            try {
              const startMs =
                reg.RPDDataEntrada.getTime() - tolEntradaMin * 60_000;
              const endMs =
                reg.RPDDataSaida.getTime() + tolSaidaMin * 60_000;

              const payload = {
                startDate: new Date(startMs).toISOString(),
                endDate: new Date(endMs).toISOString(),
                present: true,
                justification: '',
              };
              const resp = await client.post(`/persons/${pessoa.PESIdExterno}/attendances/interval`, payload);
              await this.prisma.rPDRegistrosDiarios.update({
                where: { RPDCodigo: reg.RPDCodigo },
                data: { RPDStatus: RPDStatus.ENVIADO, RPDResult: resp.data ?? {} },
              });
            } catch (err: any) {
              const errData = err?.response?.data ?? err?.message ?? String(err);
              await this.prisma.rPDRegistrosDiarios.update({
                where: { RPDCodigo: reg.RPDCodigo },
                data: { RPDStatus: RPDStatus.ERRO, RPDResult: errData },
              });
            }
          }
        }
        /* Com horário: sem entrada+saída completas não envia nada ao Gennera (nem falta). */

        processed++;
        const percent = Math.round((processed / total) * 100);
        await this.setJobStatus(jobId, { status: 'running', percent, total, processed });
      }
    }

    await this.setJobStatus(jobId, { status: 'done', percent: 100, total, processed });
  }

  private async lancamentoSemHorario(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
    dias: Date[],
  ) {
    const lancaPresenca = dto.lancaPresenca !== false;
    const selecionadas = dto.pessoasCodigos && dto.pessoasCodigos.length > 0;

    let pessoasAlvo: { PESCodigo: number; PESIdExterno: string | null }[] = [];
    if (selecionadas) {
      pessoasAlvo = await this.prisma.pESPessoa.findMany({
        where: { INSInstituicaoCodigo: instituicaoCodigo, PESCodigo: { in: dto.pessoasCodigos }, PESAtivo: true },
        select: { PESCodigo: true, PESIdExterno: true },
      });
    } else {
      pessoasAlvo = await this.prisma.pESPessoa.findMany({
        where: { INSInstituicaoCodigo: instituicaoCodigo, PESAtivo: true, deletedAt: null },
        select: { PESCodigo: true, PESIdExterno: true },
      });
    }

    const total = dias.length * pessoasAlvo.length;
    let processed = 0;
    await this.setJobStatus(jobId, { status: 'running', percent: 0, total, processed });

    for (const dia of dias) {
      const dateStr = dia.toISOString().split('T')[0];

      for (const pessoa of pessoasAlvo) {
        if (!pessoa.PESIdExterno) {
          processed++;
          continue;
        }

        let rpdResult: any = null;
        let rpdStatus: RPDStatus = RPDStatus.PENDENTE;
        let isNew = false;

        const existing = await this.prisma.rPDRegistrosDiarios.findUnique({
          where: { INSInstituicaoCodigo_PESCodigo_RPDData: { INSInstituicaoCodigo: instituicaoCodigo, PESCodigo: pessoa.PESCodigo, RPDData: dia } },
        });

        try {
          const resp = await client.post(`/persons/${pessoa.PESIdExterno}/attendances`, {
            date: dateStr,
            present: lancaPresenca,
            justification: '',
          });
          rpdResult = resp.data ?? {};
          rpdStatus = existing ? RPDStatus.ENVIADO : RPDStatus.MANUAL;
        } catch (err: any) {
          rpdResult = err?.response?.data ?? err?.message ?? String(err);
          rpdStatus = RPDStatus.ERRO;
        }

        if (existing) {
          await this.prisma.rPDRegistrosDiarios.update({
            where: { RPDCodigo: existing.RPDCodigo },
            data: { RPDResult: rpdResult, RPDStatus: rpdStatus },
          });
        } else {
          await this.prisma.rPDRegistrosDiarios.create({
            data: {
              INSInstituicaoCodigo: instituicaoCodigo,
              PESCodigo: pessoa.PESCodigo,
              RPDData: dia,
              RPDStatus: rpdStatus,
              RPDResult: rpdResult,
            },
          });
        }

        processed++;
        const percent = Math.round((processed / total) * 100);
        await this.setJobStatus(jobId, { status: 'running', percent, total, processed });
      }
    }

    await this.setJobStatus(jobId, { status: 'done', percent: 100, total, processed });
  }
}
