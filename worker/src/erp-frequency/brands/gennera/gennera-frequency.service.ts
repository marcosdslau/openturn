import { PrismaClient, Prisma, RPDStatus } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { ErpFrequencyProvider, ErpFrequencySendResult } from '../../erp-frequency.types';
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

  async sendPendingFrequencies(instituicaoCodigo: number): Promise<ErpFrequencySendResult> {
    const inst = await this.prisma.iNSInstituicao.findUnique({
      where: { INSCodigo: instituicaoCodigo },
      select: {
        INSToleranciaEntradaMinutos: true,
        INSToleranciaSaidaMinutos: true,
      },
    });

    const tolEntradaMin = Math.max(0, inst?.INSToleranciaEntradaMinutos ?? 15);
    const tolSaidaMin = Math.max(0, inst?.INSToleranciaSaidaMinutos ?? 15);

    const rpds = await this.prisma.rPDRegistrosDiarios.findMany({
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        RPDStatus: { in: [RPDStatus.PENDENTE, RPDStatus.ERRO] },
        RPDDataEntrada: { not: null },
        RPDDataSaida: { not: null },
      },
      include: {
        pessoa: { select: { PESIdExterno: true } },
      },
    });

    let enviados = 0;
    let erros = 0;
    let ignorados = 0;

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

    ignorados = 0; // nenhum registro ignorado neste modo

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
