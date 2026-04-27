import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from './queue/rotina-queue.service';
import { TipoRotina } from '@prisma/client';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import { redisCronLockKey } from '../common/redis/redis-keys';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: PrismaService,
    private readonly rotinaQueueService: RotinaQueueService,
  ) {
    try {
      this.redis = new Redis({
        ...getRedisConnectionOptions(),
        lazyConnect: true,
      });
      this.redis.connect().catch(() => {
        this.logger.warn(
          'Redis not available for cron lock — running without distributed lock',
        );
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
  }

  private async acquireCronLock(rotinaId: number): Promise<boolean> {
    if (!this.redis) return true;
    const lockKey = redisCronLockKey(rotinaId);
    const result = await this.redis.set(lockKey, '1', 'EX', 120, 'NX');
    return result === 'OK';
  }

  async onModuleInit() {
    this.logger.log('Inicializando agendador de rotinas...');
    await this.loadActiveRoutines();
  }

  async loadActiveRoutines() {
    try {
      const rotinas = await this.prisma.rOTRotina.findMany({
        where: {
          ROTAtivo: true,
          ROTTipo: TipoRotina.SCHEDULE,
          ROTCronExpressao: { not: null },
        },
      });

      this.logger.log(
        `Encontradas ${rotinas.length} rotinas ativas do tipo agendamento (SCHEDULE) com cron.`,
      );

      for (const rotina of rotinas) {
        if (rotina.ROTCronExpressao) {
          this.addCronJob(
            rotina.ROTCodigo,
            rotina.ROTCronExpressao,
            rotina.INSInstituicaoCodigo,
            rotina.ROTNome,
          );
        }
      }
    } catch (error) {
      this.logger.error('Erro ao carregar rotinas:', error);
    }
  }

  addCronJob(
    rotinaId: number,
    cronExpression: string,
    instituicaoCodigo: number,
    nome: string,
  ) {
    const jobName = `rotina-${rotinaId}`;

    this.removeCronJob(rotinaId);

    try {
      const job = new CronJob(cronExpression, async () => {
        const acquired = await this.acquireCronLock(rotinaId);
        if (!acquired) {
          this.logger.debug(
            `Cron lock not acquired for rotina ${rotinaId} — skipping (another replica owns it)`,
          );
          return;
        }
        this.logger.log(`Enfileirando rotina agendada: ${nome} (${rotinaId})`);
        try {
          await this.rotinaQueueService.enqueue(
            rotinaId,
            instituicaoCodigo,
            'SCHEDULE',
            { scheduled: true },
          );
        } catch (err) {
          this.logger.error(`Erro ao enfileirar rotina ${rotinaId}:`, err);
        }
      });

      this.schedulerRegistry.addCronJob(jobName, job);
      job.start();

      this.logger.log(`Rotina ${rotinaId} agendada: ${cronExpression}`);
    } catch (error: any) {
      this.logger.error(`Erro ao agendar rotina ${rotinaId}: ${error.message}`);
    }
  }

  removeCronJob(rotinaId: number) {
    const jobName = `rotina-${rotinaId}`;
    try {
      const job = this.schedulerRegistry.getCronJob(jobName);
      if (job) {
        job.stop();
        this.schedulerRegistry.deleteCronJob(jobName);
        this.logger.log(`Agendamento removido para rotina ${rotinaId}`);
      }
    } catch (e) {
      // Ignora se job não existir
    }
  }
}
