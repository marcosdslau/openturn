import { PrismaClient, Prisma, RPDStatus } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import {
  ErpFrequencyProvider,
  ErpFrequencySendResult,
  ImplantacaoFiltro,
} from '../../erp-frequency.types';
import { resolveAllowedPessoaCodigos } from '../../implantacao.util';
import { workerLogLine } from '../../../worker-log';

type ErpConfig = {
  ERPSistema: string;
  ERPUrlBase: string | null;
  ERPToken: string | null;
  ERPConfigJson: Prisma.JsonValue | null;
};

export class GenneraFrequencyService implements ErpFrequencyProvider {
  readonly erpSistema = 'Gennera';

  private readonly client: AxiosInstance;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly erpConfig: ErpConfig,
  ) {
    const extraHeaders: Record<string, string> =
      (erpConfig.ERPConfigJson as any)?.headers ?? {};
    this.client = axios.create({
      baseURL: erpConfig.ERPUrlBase!,
      headers: {
        'x-access-token': `${erpConfig.ERPToken ?? ''}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    });
  }

  async sendPendingFrequencies(
    instituicaoCodigo: number,
    filtro?: ImplantacaoFiltro,
  ): Promise<ErpFrequencySendResult> {
    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: {
        INSToleranciaEntradaMinutos: true,
        INSToleranciaSaidaMinutos: true,
        INSFusoHorario: true,
        INSLancFreqAusenciaRegistro: true,
      },
    });

    const tolEntradaMin = Math.max(0, inst?.INSToleranciaEntradaMinutos ?? 15);
    const tolSaidaMin = Math.max(0, inst?.INSToleranciaSaidaMinutos ?? 15);
    const fusoHorario = inst?.INSFusoHorario ?? -3;
    const lancarAusencias = inst?.INSLancFreqAusenciaRegistro === true;

    // Implantação (turmas pioneiras): quando ativa, restringe aos PESCodigo das
    // turmas configuradas (null = sem restrição). Quando desativada, o piso de
    // Go-Live (RPDData >= dataGoLive) é aplicado diretamente na query abaixo.
    const allowedPessoaCodigos = await resolveAllowedPessoaCodigos(
      this.prisma,
      instituicaoCodigo,
      filtro,
    );

    const rpds = await this.prisma.rPDRegistrosDiarios.findMany({
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        RPDStatus: { in: [RPDStatus.PENDENTE, RPDStatus.MANUAL, RPDStatus.ERRO] },
        RPDDataEntrada: { not: null },
        RPDDataSaida: { not: null },
        ...(allowedPessoaCodigos !== null && { PESCodigo: { in: allowedPessoaCodigos } }),
        ...(!filtro?.ativo && filtro?.dataGoLive && { RPDData: { gte: filtro.dataGoLive } }),
      },
      include: {
        pessoa: { select: { PESIdExterno: true } },
      },
    });

    let enviados = 0;
    let erros = 0;
    let ignorados = 0;

    const diasMap = new Map<string, Date>();
    for (const rpd of rpds) {
      const d = rpd.RPDData;
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (!diasMap.has(key)) diasMap.set(key, d);
    }
    const dias = [...diasMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, date]) => ({ key, date }));
    const diasLabel = dias.map(({ date }) => `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`);

    const buildUtcFromLocalDay = (day: Date, hhmm: string): Date => {
      const [hh, mm] = hhmm.split(':').map(Number);
      return new Date(Date.UTC(
        day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
        hh - fusoHorario, mm, 0, 0,
      ));
    };

    if (lancarAusencias) {
      const rpdGroups = new Map<string, typeof rpds>();
      for (const rpd of rpds) {
        const d = rpd.RPDData;
        const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const groupKey = `${rpd.PESCodigo}|${dayKey}`;
        const arr = rpdGroups.get(groupKey) ?? [];
        arr.push(rpd);
        rpdGroups.set(groupKey, arr);
      }

      for (const [, groupRpds] of rpdGroups) {
        const pesIdExterno = groupRpds[0].pessoa.PESIdExterno;

        if (!pesIdExterno) {
          for (const rpd of groupRpds) {
            await this.aplicarResultado(rpd.RPDCodigo, false, { error: 'PESIdExterno não configurado' });
            erros++;
          }
          continue;
        }

        const dayStart = buildUtcFromLocalDay(groupRpds[0].RPDData, '01:00');
        const dayEnd = buildUtcFromLocalDay(groupRpds[0].RPDData, '23:59');
        try {
          await this.client.post(`/persons/${pesIdExterno}/attendances/interval`, {
            startDate: dayStart.toISOString(),
            endDate: dayEnd.toISOString(),
            present: false,
            justification: '',
          });
          enviados++;
        } catch (err: any) {
          const errData = err?.response?.data ?? { message: err?.message ?? String(err) };
          erros++;
          console.error(
            workerLogLine(
              `[GenneraFreq] falta dia todo pes=${groupRpds[0].PESCodigo} erro: ${JSON.stringify(errData)}`,
            ),
          );
        }

        for (const rpd of groupRpds) {
          const startMs = rpd.RPDDataEntrada!.getTime() - tolEntradaMin * 60_000;
          const endMs = rpd.RPDDataSaida!.getTime() + tolSaidaMin * 60_000;

          try {
            await this.client.post(`/persons/${pesIdExterno}/attendances/interval`, {
              startDate: new Date(startMs).toISOString(),
              endDate: new Date(endMs).toISOString(),
              present: true,
              justification: '',
            });
            await this.aplicarResultado(rpd.RPDCodigo, true);
            enviados++;
          } catch (err: any) {
            const errData = err?.response?.data ?? { message: err?.message ?? String(err) };
            await this.aplicarResultado(rpd.RPDCodigo, false, errData);
            erros++;
            console.error(workerLogLine(`[GenneraFreq] RPD=${rpd.RPDCodigo} erro: ${JSON.stringify(errData)}`));
          }
        }
      }
    } else {
      for (const rpd of rpds) {
        const pesIdExterno = rpd.pessoa.PESIdExterno;

        if (!pesIdExterno) {
          await this.aplicarResultado(rpd.RPDCodigo, false, { error: 'PESIdExterno não configurado' });
          erros++;
          continue;
        }

        const startMs = rpd.RPDDataEntrada!.getTime() - tolEntradaMin * 60_000;
        const endMs = rpd.RPDDataSaida!.getTime() + tolSaidaMin * 60_000;

        try {
          await this.client.post(`/persons/${pesIdExterno}/attendances/interval`, {
            startDate: new Date(startMs).toISOString(),
            endDate: new Date(endMs).toISOString(),
            present: true,
            justification: '',
          });
          await this.aplicarResultado(rpd.RPDCodigo, true);
          enviados++;
        } catch (err: any) {
          const errData = err?.response?.data ?? { message: err?.message ?? String(err) };
          await this.aplicarResultado(rpd.RPDCodigo, false, errData);
          erros++;
          console.error(workerLogLine(`[GenneraFreq] RPD=${rpd.RPDCodigo} erro: ${JSON.stringify(errData)}`));
        }
      }
    }

    if (lancarAusencias && dias.length > 0) {
      console.log(
        workerLogLine(
          `[GenneraFreq] inst=${instituicaoCodigo} lançar faltas (sem registro) habilitado: dias=${diasLabel.join(', ') || '—'}`,
        ),
      );

      const matriculasAtivas = await this.prisma.mATMatricula.findMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          MATAtivo: true,
          ...(allowedPessoaCodigos !== null && { PESCodigo: { in: allowedPessoaCodigos } }),
        },
        select: {
          PESCodigo: true,
          pessoa: { select: { PESIdExterno: true } },
        },
      });

      const alunos = new Map<number, string | null>();
      for (const m of matriculasAtivas) {
        if (!alunos.has(m.PESCodigo)) alunos.set(m.PESCodigo, m.pessoa.PESIdExterno ?? null);
      }

      const rpdPresenca = await this.prisma.rPDRegistrosDiarios.findMany({
        where: {
          INSInstituicaoCodigo: instituicaoCodigo,
          RPDData: { in: dias.map((d) => d.date) },
        },
        select: { PESCodigo: true, RPDData: true },
      });

      const presencaSet = new Set<string>();
      for (const r of rpdPresenca) {
        const d = r.RPDData;
        const dayKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        presencaSet.add(`${r.PESCodigo}|${dayKey}`);
      }

      const missingIdCounted = new Set<number>();

      for (const day of dias) {
        for (const [pesCodigo, pesIdExterno] of alunos.entries()) {
          if (presencaSet.has(`${pesCodigo}|${day.key}`)) continue;

          if (!pesIdExterno) {
            if (!missingIdCounted.has(pesCodigo)) {
              ignorados++;
              missingIdCounted.add(pesCodigo);
            }
            continue;
          }

          const start = buildUtcFromLocalDay(day.date, '01:00');
          const end = buildUtcFromLocalDay(day.date, '23:59');

          try {
            await this.client.post(`/persons/${pesIdExterno}/attendances/interval`, {
              startDate: start.toISOString(),
              endDate: end.toISOString(),
              present: false,
              justification: '',
            });
            enviados++;
          } catch (err: any) {
            const errData = err?.response?.data ?? { message: err?.message ?? String(err) };
            erros++;
            console.error(
              workerLogLine(
                `[GenneraFreq] falta inst=${instituicaoCodigo} pes=${pesCodigo} day=${day.key} erro: ${JSON.stringify(errData)}`,
              ),
            );
          }
        }
      }
    }

    return { enviados, erros, ignorados };
  }

  private async aplicarResultado(rpdCodigo: number, ok: boolean, errorBody?: unknown) {
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
