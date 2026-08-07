import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StatusExecucao } from '@prisma/client';
import Redis from 'ioredis';
import { subMinutes } from 'date-fns';
import { PrismaService } from '../common/prisma/prisma.service';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import {
  redisSerialWaitKey,
  redisSerialProcessingKey,
} from '../common/redis/redis-keys';

const STALE_MINUTES = Math.max(
  1,
  parseInt(process.env.SERIAL_LOCK_WATCHDOG_STALE_MINUTES || '10', 10),
);

/**
 * Recupera execuções presas em AGUARDANDO_LOCK_SERIAL por tempo anormal — indício de que o
 * exeId foi perdido entre o Redis (fila de espera serial) e o Postgres (ex.: worker/Redis
 * caiu exatamente entre o RPUSH e o commit do status, ou o índice de pares do worker perdeu
 * o rastro do par). Antes de reenfileirar, verifica se o exeId já está presente na wait list
 * ou na lista de processing do par (instituicaoCodigo, rotinaCodigo) — só reenfileira quando
 * ausente de ambas, evitando duplicar um item que só está esperando atrás de um backlog
 * grande (o que não é, por si só, um problema).
 */
@Injectable()
export class SerialLockWatchdogService implements OnModuleDestroy {
  private readonly logger = new Logger(SerialLockWatchdogService.name);
  private redis: Redis | null = null;

  constructor(private readonly prisma: PrismaService) {
    try {
      const client = new Redis({
        ...getRedisConnectionOptions(),
        lazyConnect: true,
        commandTimeout: 10_000,
        maxRetriesPerRequest: 3,
      });
      client.on('error', (err) => {
        this.logger.warn(`Redis error (watchdog): ${err?.message ?? err}`);
      });
      this.redis = client;
      client.connect().catch(() => {
        this.logger.warn('Redis indisponível: recuperação automática desligada (só log).');
        void client.quit();
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
  }

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

        if (exec.ROTCodigo == null) {
          this.logger.warn(
            `Execução presa em AGUARDANDO_LOCK_SERIAL sem ROTCodigo — exeId=${exec.EXEIdExterno}. Ignorando.`,
          );
          continue;
        }

        const recovered = await this.tryRecover(
          exec.EXEIdExterno,
          exec.INSInstituicaoCodigo,
          exec.ROTCodigo,
        );

        if (recovered === true) {
          this.logger.warn(
            `Execução presa em AGUARDANDO_LOCK_SERIAL há ${minutosParado}min recuperada (RPUSH de volta na wait list) — ` +
              `exeId=${exec.EXEIdExterno} instituicaoCodigo=${exec.INSInstituicaoCodigo} rotinaCodigo=${exec.ROTCodigo}.`,
          );
        } else if (recovered === false) {
          // Já presente na wait/processing list — apenas backlog normal, nada a fazer.
          this.logger.debug(
            `Execução em AGUARDANDO_LOCK_SERIAL há ${minutosParado}min ainda presente na fila Redis — ` +
              `exeId=${exec.EXEIdExterno} (backlog normal).`,
          );
        } else {
          // Redis indisponível: mantém o comportamento antigo (só sinaliza para ação manual).
          this.logger.warn(
            `Execução presa em AGUARDANDO_LOCK_SERIAL há ${minutosParado}min — ` +
              `exeId=${exec.EXEIdExterno} instituicaoCodigo=${exec.INSInstituicaoCodigo} ` +
              `rotinaCodigo=${exec.ROTCodigo}. Redis indisponível para recuperação automática — ` +
              'reprocessamento manual disponível na tela de execuções.',
          );
        }
      }
    } catch (error) {
      this.logger.error('Erro ao verificar execuções presas em AGUARDANDO_LOCK_SERIAL:', error);
    }
  }

  /**
   * Retorna `true` se recuperou (reenfileirou), `false` se já estava presente na fila (nada a
   * fazer) e `null` se o Redis está indisponível (recuperação automática não é possível).
   */
  private async tryRecover(
    exeId: string,
    instituicaoCodigo: number,
    rotinaCodigo: number,
  ): Promise<boolean | null> {
    if (!this.redis) return null;
    try {
      const waitKey = redisSerialWaitKey(instituicaoCodigo, rotinaCodigo);
      const processingKey = redisSerialProcessingKey(instituicaoCodigo, rotinaCodigo);
      const [inWait, inProcessing] = await Promise.all([
        this.redis.lpos(waitKey, exeId),
        this.redis.lpos(processingKey, exeId),
      ]);
      if (inWait !== null || inProcessing !== null) {
        return false;
      }
      await this.redis.rpush(waitKey, exeId);
      return true;
    } catch (error) {
      this.logger.error(`Erro ao tentar recuperar exeId=${exeId} no Redis:`, error);
      return null;
    }
  }
}
