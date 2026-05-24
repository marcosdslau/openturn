import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import { RPDStatus } from '@prisma/client';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import { channelSyncSchedulerRefresh } from '../common/redis/redis-keys';

const LOCK_TTL_SEC = 90;
const FREQ_LOCK_KEY_PREFIX = 'freq:erp:sync:cron:lock';

@Injectable()
export class FreqEducacionalSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FreqEducacionalSyncScheduler.name);
  private redis: Redis | null = null;
  private redisSub: Redis | null = null;
  /** jobName → INSCodigo */
  private readonly cronJobs = new Map<string, number>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: PrismaService,
    private readonly queueService: RotinaQueueService,
  ) {}

  async onModuleInit() {
    this.setupRedis();
    await this.reconcileSchedules();
  }

  onModuleDestroy() {
    this.redisSub?.disconnect();
    this.redis?.disconnect();
    for (const name of this.cronJobs.keys()) {
      this.removeCronJob(name);
    }
  }

  private setupRedis() {
    try {
      this.redis = new Redis({ ...getRedisConnectionOptions(), lazyConnect: true });
      this.redis.connect().catch(() => {
        this.logger.warn('Redis indisponível — lock distribuído do freq scheduler desligado');
        this.redis = null;
      });

      this.redisSub = new Redis({ ...getRedisConnectionOptions(), lazyConnect: true });
      this.redisSub.connect().then(() => {
        this.redisSub!.subscribe(channelSyncSchedulerRefresh(), (err) => {
          if (err) this.logger.error('Erro ao subscrever canal sync refresh', err);
        });
        this.redisSub!.on('message', (_channel, _msg) => {
          this.reconcileSchedules().catch((e) =>
            this.logger.error('Erro ao reconciliar schedules freq', e),
          );
        });
      }).catch(() => {
        this.logger.warn('Redis indisponível — freq scheduler não receberá atualizações em tempo real');
      });
    } catch {
      this.logger.warn('Redis não configurado para o freq scheduler');
    }
  }

  async reconcileSchedules() {
    try {
      const instituicoes = await this.prisma.iNSInstituicao.findMany({
        where: { INSAtivo: true, INSSyncFreqEducacional: true, INSWorkerAtivo: true },
        select: { INSCodigo: true, INSTempoFreqEducacional: true },
      });

      const activeIds = new Set(instituicoes.map((i) => i.INSCodigo));

      for (const [name, instId] of this.cronJobs.entries()) {
        if (!activeIds.has(instId)) {
          this.removeCronJob(name);
        }
      }

      for (const inst of instituicoes) {
        const name = this.jobName(inst.INSCodigo);
        const cronExpr = inst.INSTempoFreqEducacional || '58 23 * * *';

        const existing = this.cronJobs.get(name);
        if (existing !== undefined) {
          try {
            const job = this.schedulerRegistry.getCronJob(name);
            if ((job as any).cronTime?.source !== cronExpr) {
              this.removeCronJob(name);
            } else {
              continue;
            }
          } catch {
            this.cronJobs.delete(name);
          }
        }

        this.registerCronJob(inst.INSCodigo, cronExpr);
      }

      this.logger.log(`Freq scheduler reconciliado: ${this.cronJobs.size} instituições agendadas`);
    } catch (err) {
      this.logger.error('Erro ao reconciliar schedules freq', err);
    }
  }

  private registerCronJob(instCodigo: number, cronExpr: string) {
    const name = this.jobName(instCodigo);
    try {
      const job = new CronJob(cronExpr, () => this.onTick(instCodigo), null, true, undefined, null, false);
      this.schedulerRegistry.addCronJob(name, job as any);
      job.start();
      this.cronJobs.set(name, instCodigo);
      this.logger.log(`Cron de freq registrado: inst=${instCodigo} expr="${cronExpr}"`);
    } catch (err) {
      this.logger.error(`Erro ao registrar cron freq para inst=${instCodigo} expr="${cronExpr}": ${err}`);
    }
  }

  private removeCronJob(name: string) {
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      job.stop();
      this.schedulerRegistry.deleteCronJob(name);
    } catch { /* já removido */ }
    this.cronJobs.delete(name);
  }

  private async onTick(instCodigo: number) {
    const lockKey = `${FREQ_LOCK_KEY_PREFIX}:${instCodigo}`;
    if (this.redis) {
      const acquired = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL_SEC, 'NX');
      if (acquired !== 'OK') return;
    }

    try {
      const count = await this.prisma.rPDRegistrosDiarios.count({
        where: {
          INSInstituicaoCodigo: instCodigo,
          RPDStatus: { not: RPDStatus.ENVIADO },
          RPDDataEntrada: { not: null },
          RPDDataSaida: { not: null },
        },
      });

      if (count > 0) {
        await this.queueService.publishFreqEducacionalSyncJob(instCodigo);
        this.logger.log(`FREQ_ERP_SYNC job enfileirado para inst=${instCodigo} (${count} RPDs pendentes)`);
      }
    } catch (err) {
      this.logger.error(`Erro no tick de freq sync para inst=${instCodigo}`, err);
    }
  }

  private jobName(instCodigo: number) {
    return `freq-erp-sync-${instCodigo}`;
  }
}
