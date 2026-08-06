import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StatusExecucao } from '@prisma/client';
import { subMinutes } from 'date-fns';
import { PrismaService } from '../common/prisma/prisma.service';

const STALE_MINUTES = Math.max(
  1,
  parseInt(process.env.SERIAL_LOCK_WATCHDOG_STALE_MINUTES || '10', 10),
);

/**
 * Sinaliza (não republica) execuções presas em AGUARDANDO_LOCK_SERIAL por tempo anormal —
 * indício de que o worker/Redis caiu entre o enqueue e o dreno (ver
 * working/processamento-serial/correcao-estrutural.md, §7.3). Recuperação é manual, pelo
 * botão "Reprocessar" já existente na tela de execuções — nenhuma mudança de UI necessária.
 */
@Injectable()
export class SerialLockWatchdogService {
  private readonly logger = new Logger(SerialLockWatchdogService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/2 * * * *')
  async handleCheck() {
    const cutoff = subMinutes(new Date(), STALE_MINUTES);

    try {
      const stuck = await this.prisma.rOTExecucaoLog.findMany({
        where: {
          EXEStatus: StatusExecucao.AGUARDANDO_LOCK_SERIAL,
          updatedAt: { lt: cutoff },
        },
        select: {
          EXEIdExterno: true,
          ROTCodigo: true,
          INSInstituicaoCodigo: true,
          updatedAt: true,
        },
        take: 100,
      });

      if (stuck.length === 0) return;

      for (const exec of stuck) {
        const minutosParado = Math.round(
          (Date.now() - exec.updatedAt.getTime()) / 60000,
        );
        this.logger.warn(
          `Execução presa em AGUARDANDO_LOCK_SERIAL há ${minutosParado}min — ` +
            `exeId=${exec.EXEIdExterno} instituicaoCodigo=${exec.INSInstituicaoCodigo} ` +
            `rotinaCodigo=${exec.ROTCodigo}. Reprocessamento manual disponível na tela de execuções.`,
        );
      }
    } catch (error) {
      this.logger.error('Erro ao verificar execuções presas em AGUARDANDO_LOCK_SERIAL:', error);
    }
  }
}
