import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { StatusComando } from '@prisma/client';

@Injectable()
export class ControlidCommandQueueService {
  private readonly logger = new Logger(ControlidCommandQueueService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPendingCommand(equipamentoCodigo: number) {
    const cmd = await this.prisma.cMDComandoFila.findFirst({
      where: {
        EQPCodigo: equipamentoCodigo,
        CMDStatus: StatusComando.PENDENTE,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!cmd) return {};

    await this.prisma.cMDComandoFila.update({
      where: { CMDCodigo: cmd.CMDCodigo },
      data: { CMDStatus: StatusComando.ENVIADO },
    });

    return {
      verb: cmd.CMDVerb,
      endpoint: cmd.CMDEndpoint,
      body: cmd.CMDBody,
      contentType: cmd.CMDContentType,
    };
  }

  async processResult(equipamentoCodigo: number, resultado: any) {
    const cmd = await this.prisma.cMDComandoFila.findFirst({
      where: { EQPCodigo: equipamentoCodigo, CMDStatus: StatusComando.ENVIADO },
      orderBy: { createdAt: 'asc' },
    });

    if (cmd) {
      await this.prisma.cMDComandoFila.update({
        where: { CMDCodigo: cmd.CMDCodigo },
        data: {
          CMDStatus: StatusComando.EXECUTADO,
          CMDResultado: resultado,
        },
      });
      this.logger.log(
        `Command ${cmd.CMDCodigo} executed for device ${equipamentoCodigo}`,
      );
    }
  }

  async enqueueCommand(
    equipamentoCodigo: number,
    instituicaoCodigo: number,
    endpoint: string,
    body: any,
    verb = 'POST',
  ) {
    return this.prisma.cMDComandoFila.create({
      data: {
        EQPCodigo: equipamentoCodigo,
        CMDVerb: verb,
        CMDEndpoint: endpoint,
        CMDBody: body,
        INSInstituicaoCodigo: instituicaoCodigo,
      },
    });
  }
}
