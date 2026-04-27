import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UsageRecord } from '../providers/LlmProvider.interface';

@Injectable()
export class AiUsageService {
  constructor(private prisma: PrismaService) {}

  /**
   * Log consumption in the internal credit ledger
   */
  async logConversationUsage(
    instituicaoCodigo: number,
    userCodigo: number,
    modelCodigo: number,
    usage: UsageRecord,
  ): Promise<void> {
    await this.prisma.aILCreditoLedger.create({
      data: {
        INSInstituicaoCodigo: instituicaoCodigo,
        USRCodigo: userCodigo,
        AIMCodigo: modelCodigo,
        AILTipoLog: 'DEBIT_CONSUMO',
        AILTokensInput: usage.inputTokens,
        AILTokensOutput: usage.outputTokens,
        AILValorUsd: usage.costUsd || 0,
      },
    });
  }

  /**
   * Calculate daily tokens used by summing ledger
   */
  async getDailyTokensUsed(
    instituicaoCodigo: number,
    userCodigo: number,
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.aILCreditoLedger.aggregate({
      _sum: {
        AILTokensInput: true,
        AILTokensOutput: true,
      },
      where: {
        INSInstituicaoCodigo: instituicaoCodigo,
        USRCodigo: userCodigo,
        AILTipoLog: 'DEBIT_CONSUMO',
        createdAt: {
          gte: today,
        },
      },
    });

    const inTokens = result._sum.AILTokensInput || 0;
    const outTokens = result._sum.AILTokensOutput || 0;
    return inTokens + outTokens;
  }
}
