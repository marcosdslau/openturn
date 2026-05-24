import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma, RPDStatus } from '@prisma/client';
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

    if (erpConfig.ERPSistema !== 'Gennera') {
      await this.setJobStatus(jobId, { status: 'error', percent: 0, total: 0, processed: 0, error: `ERP "${erpConfig.ERPSistema}" não suportado. Apenas Gennera é compatível com lançamento manual.` });
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

    setImmediate(() => {
      this.runLancamento(jobId, instituicaoCodigo, dto, axiosClient).catch((err) => {
        this.logger.error(`Falha no job Gennera ${jobId}`, err);
        this.setJobStatus(jobId, { status: 'error', percent: 100, total: 0, processed: 0, error: err?.message ?? String(err) });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Resolução de pessoas-alvo
  // ---------------------------------------------------------------------------

  private async resolvePessoasAlvo(
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
  ): Promise<{ PESCodigo: number; PESIdExterno: string | null }[]> {
    const temCodigos = dto.pessoasCodigos && dto.pessoasCodigos.length > 0;
    const temMatricula =
      (dto.cursos && dto.cursos.length > 0) ||
      (dto.series && dto.series.length > 0) ||
      (dto.turmas && dto.turmas.length > 0);

    const where: any = {
      INSInstituicaoCodigo: instituicaoCodigo,
      PESAtivo: true,
      deletedAt: null,
    };

    if (temCodigos) {
      where.PESCodigo = { in: dto.pessoasCodigos };
    }

    if (temMatricula) {
      const matriculaWhere: any = { MATAtivo: true };
      if (dto.cursos && dto.cursos.length > 0) matriculaWhere.MATCurso = { in: dto.cursos };
      if (dto.series && dto.series.length > 0) matriculaWhere.MATSerie = { in: dto.series };
      if (dto.turmas && dto.turmas.length > 0) matriculaWhere.MATTurma = { in: dto.turmas };
      where.matriculas = { some: matriculaWhere };
    }

    return this.prisma.pESPessoa.findMany({
      where,
      select: { PESCodigo: true, PESIdExterno: true },
      orderBy: { PESCodigo: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Orquestração principal
  // ---------------------------------------------------------------------------

  private async runLancamento(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
  ) {
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
      await this.lancamentoHorarioManual(jobId, instituicaoCodigo, dto, client, dias);
    }
  }

  // ---------------------------------------------------------------------------
  // Modo A — horário das passagens (RPD entrada/saída)
  // ---------------------------------------------------------------------------

  private async lancamentoComHorario(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
    dias: Date[],
  ) {
    const pessoasAlvo = await this.resolvePessoasAlvo(instituicaoCodigo, dto);

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
          PESCodigo: { in: pessoasAlvo.map((p) => p.PESCodigo) },
          // Retry: processar apenas PENDENTE e ERRO; pular ENVIADO
          RPDStatus: { in: [RPDStatus.PENDENTE, RPDStatus.ERRO] },
        },
      });

      const registrosPorPes = new Map<number, typeof registrosDia[number][]>();
      for (const r of registrosDia) {
        const arr = registrosPorPes.get(r.PESCodigo) ?? [];
        arr.push(r);
        registrosPorPes.set(r.PESCodigo, arr);
      }

      for (const pessoa of pessoasAlvo) {
        const todasJanelas = registrosPorPes.get(pessoa.PESCodigo) ?? [];
        const janelaValidas = todasJanelas.filter(
          (r) => r.RPDDataEntrada != null && r.RPDDataSaida != null,
        );

        if (todasJanelas.length > 0 && !pessoa.PESIdExterno) {
          for (const reg of todasJanelas) {
            await this.aplicarResultadoGennera(reg.RPDCodigo, false, { error: 'PESIdExterno não configurado' });
          }
        } else {
          for (const reg of janelaValidas) {
            try {
              const startMs = reg.RPDDataEntrada!.getTime() - tolEntradaMin * 60_000;
              const endMs = reg.RPDDataSaida!.getTime() + tolSaidaMin * 60_000;

              await client.post(`/persons/${pessoa.PESIdExterno}/attendances/interval`, {
                startDate: new Date(startMs).toISOString(),
                endDate: new Date(endMs).toISOString(),
                present: true,
                justification: '',
              });
              await this.aplicarResultadoGennera(reg.RPDCodigo, true);
            } catch (err: any) {
              const errData = err?.response?.data ?? { message: err?.message ?? String(err) };
              await this.aplicarResultadoGennera(reg.RPDCodigo, false, errData);
            }
          }
        }

        processed++;
        await this.setJobStatus(jobId, {
          status: 'running',
          percent: Math.round((processed / total) * 100),
          total,
          processed,
        });
      }
    }

    await this.setJobStatus(jobId, { status: 'done', percent: 100, total, processed });
  }

  // ---------------------------------------------------------------------------
  // Modo B — horário manual (sem usar RPD entrada/saída)
  // ---------------------------------------------------------------------------

  private async lancamentoHorarioManual(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
    dias: Date[],
  ) {
    if (dto.usarIntervaloHorario) {
      await this.lancamentoIntervaloFixo(jobId, instituicaoCodigo, dto, client, dias);
    } else {
      await this.lancamentoPresencaDia(jobId, instituicaoCodigo, dto, client, dias);
    }
  }

  // ---------------------------------------------------------------------------
  // Modo B1 — presença/falta por dia
  // ---------------------------------------------------------------------------

  private async lancamentoPresencaDia(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
    dias: Date[],
  ) {
    const lancaPresenca = dto.lancaPresenca !== false;
    const pessoasAlvo = await this.resolvePessoasAlvo(instituicaoCodigo, dto);

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

        const existing = await this.prisma.rPDRegistrosDiarios.findUnique({
          where: {
            INSInstituicaoCodigo_PESCodigo_RPDData_RPDJanelaIndice: {
              INSInstituicaoCodigo: instituicaoCodigo,
              PESCodigo: pessoa.PESCodigo,
              RPDData: dia,
              RPDJanelaIndice: 1,
            },
          },
        });

        try {
          await client.post(`/persons/${pessoa.PESIdExterno}/attendances`, {
            date: dateStr,
            present: lancaPresenca,
            justification: '',
          });

          if (existing) {
            await this.aplicarResultadoGennera(existing.RPDCodigo, true);
          } else {
            await this.prisma.rPDRegistrosDiarios.create({
              data: {
                INSInstituicaoCodigo: instituicaoCodigo,
                PESCodigo: pessoa.PESCodigo,
                RPDData: dia,
                RPDStatus: RPDStatus.MANUAL,
                RPDResponseRequest: Prisma.DbNull,
              },
            });
          }
        } catch (err: any) {
          const errData = err?.response?.data ?? { message: err?.message ?? String(err) };
          if (existing) {
            await this.aplicarResultadoGennera(existing.RPDCodigo, false, errData);
          } else {
            await this.prisma.rPDRegistrosDiarios.create({
              data: {
                INSInstituicaoCodigo: instituicaoCodigo,
                PESCodigo: pessoa.PESCodigo,
                RPDData: dia,
                RPDStatus: RPDStatus.ERRO,
                RPDResponseRequest: errData as Prisma.InputJsonValue,
              },
            });
          }
        }

        processed++;
        await this.setJobStatus(jobId, {
          status: 'running',
          percent: Math.round((processed / total) * 100),
          total,
          processed,
        });
      }
    }

    await this.setJobStatus(jobId, { status: 'done', percent: 100, total, processed });
  }

  // ---------------------------------------------------------------------------
  // Modo B2 — intervalo de horário fixo
  // ---------------------------------------------------------------------------

  private async lancamentoIntervaloFixo(
    jobId: string,
    instituicaoCodigo: number,
    dto: IniciarLancamentoGenneraDto,
    client: AxiosInstance,
    dias: Date[],
  ) {
    const pessoasAlvo = await this.resolvePessoasAlvo(instituicaoCodigo, dto);

    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: { INSFusoHorario: true },
    });
    const fusoOffset = inst?.INSFusoHorario ?? -3;

    const [hEntrada, mEntrada] = (dto.horaEntradaIntervalo ?? '00:00').split(':').map(Number);
    const [hSaida, mSaida] = (dto.horaSaidaIntervalo ?? '00:00').split(':').map(Number);

    const total = dias.length * pessoasAlvo.length;
    let processed = 0;
    await this.setJobStatus(jobId, { status: 'running', percent: 0, total, processed });

    for (const dia of dias) {
      // Montar datas combinando data do dia com HH:mm no fuso da instituição
      const offsetMs = fusoOffset * 60 * 60 * 1000;
      // dia está armazenado como meia-noite UTC (Date via @db.Date)
      // Para obter meia-noite local: remover offset (dia UTC 12:00 → local meia-noite = dia UTC 12:00 - offset)
      const diaLocalMeiaNoite = new Date(dia.getTime() - offsetMs);
      const startDate = new Date(diaLocalMeiaNoite.getTime() + (hEntrada * 60 + mEntrada) * 60_000 - offsetMs);
      const endDate = new Date(diaLocalMeiaNoite.getTime() + (hSaida * 60 + mSaida) * 60_000 - offsetMs);

      for (const pessoa of pessoasAlvo) {
        if (!pessoa.PESIdExterno) {
          processed++;
          continue;
        }

        const existing = await this.prisma.rPDRegistrosDiarios.findUnique({
          where: {
            INSInstituicaoCodigo_PESCodigo_RPDData_RPDJanelaIndice: {
              INSInstituicaoCodigo: instituicaoCodigo,
              PESCodigo: pessoa.PESCodigo,
              RPDData: dia,
              RPDJanelaIndice: 1,
            },
          },
        });

        try {
          await client.post(`/persons/${pessoa.PESIdExterno}/attendances/interval`, {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            present: true,
            justification: '',
          });

          if (existing) {
            await this.aplicarResultadoGennera(existing.RPDCodigo, true);
          } else {
            await this.prisma.rPDRegistrosDiarios.create({
              data: {
                INSInstituicaoCodigo: instituicaoCodigo,
                PESCodigo: pessoa.PESCodigo,
                RPDData: dia,
                RPDStatus: RPDStatus.ENVIADO,
                RPDResponseRequest: Prisma.DbNull,
              },
            });
          }
        } catch (err: any) {
          const errData = err?.response?.data ?? { message: err?.message ?? String(err) };
          if (existing) {
            await this.aplicarResultadoGennera(existing.RPDCodigo, false, errData);
          } else {
            await this.prisma.rPDRegistrosDiarios.create({
              data: {
                INSInstituicaoCodigo: instituicaoCodigo,
                PESCodigo: pessoa.PESCodigo,
                RPDData: dia,
                RPDStatus: RPDStatus.ERRO,
                RPDResponseRequest: errData as Prisma.InputJsonValue,
              },
            });
          }
        }

        processed++;
        await this.setJobStatus(jobId, {
          status: 'running',
          percent: Math.round((processed / total) * 100),
          total,
          processed,
        });
      }
    }

    await this.setJobStatus(jobId, { status: 'done', percent: 100, total, processed });
  }

  // ---------------------------------------------------------------------------
  // Helper de persistência de resultado
  // ---------------------------------------------------------------------------

  private async aplicarResultadoGennera(
    rpdCodigo: number,
    ok: boolean,
    errorBody?: unknown,
  ) {
    await this.prisma.rPDRegistrosDiarios.update({
      where: { RPDCodigo: rpdCodigo },
      data: {
        RPDStatus: ok ? RPDStatus.ENVIADO : RPDStatus.ERRO,
        RPDResponseRequest: ok
          ? Prisma.DbNull
          : (errorBody as Prisma.InputJsonValue) ?? Prisma.DbNull,
      },
    });
  }
}
