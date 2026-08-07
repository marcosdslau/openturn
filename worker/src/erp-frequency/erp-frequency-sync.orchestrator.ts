import { PrismaClient } from '@prisma/client';
import { ErpFrequencyFactory } from './erp-frequency.factory';
import { ImplantacaoFiltro } from './erp-frequency.types';
import { workerLogLine } from '../worker-log';

export class ErpFrequencySyncOrchestrator {
  constructor(private readonly prisma: PrismaClient) {}

  async run(instituicaoCodigo: number): Promise<void> {
    const [inst, erpConfig] = await Promise.all([
      this.prisma.iNSInstituicao.findUnique({
        where: { INSCodigo: instituicaoCodigo },
        select: { INSImplantacao: true, INSDataGoLive: true },
      }),
      this.prisma.eRPConfiguracao.findFirst({
        where: { INSInstituicaoCodigo: instituicaoCodigo },
      }),
    ]);

    const dataGoLive = inst?.INSDataGoLive ?? new Date();

    let filtro: ImplantacaoFiltro = { ativo: false, combinacoes: [], dataGoLive };
    if (inst?.INSImplantacao) {
      const rows = await this.prisma.cIMCursosImplantacao.findMany({
        where: { INSInstituicaoCodigo: instituicaoCodigo },
        select: { CIMCurso: true, CIMSerie: true, CIMTurma: true },
      });
      filtro = {
        ativo: true,
        combinacoes: rows.map((r) => ({ curso: r.CIMCurso, serie: r.CIMSerie, turma: r.CIMTurma })),
        dataGoLive,
      };
    }

    const provider = ErpFrequencyFactory.create(erpConfig, this.prisma);
    const result = await provider.sendPendingFrequencies(instituicaoCodigo, filtro);

    console.log(
      workerLogLine(
        `[FREQ_ERP_SYNC] inst=${instituicaoCodigo} erp=${erpConfig?.ERPSistema ?? 'none'} ` +
          `implantacao=${filtro.ativo} turmas=${filtro.combinacoes.length} goLive=${dataGoLive.toISOString().slice(0, 10)} ` +
          `enviados=${result.enviados} erros=${result.erros} ignorados=${result.ignorados}`,
      ),
    );
  }
}
