import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import { channelSyncSchedulerRefresh } from '../common/redis/redis-keys';
import { isLastScheduledHour } from './cron-hour.utils';

const LOCK_TTL_SEC = 90;
const SYNC_LOCK_KEY_PREFIX = 'rpd:sync:cron:lock';

@Injectable()
export class RegistroDiarioSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegistroDiarioSyncScheduler.name);
  private redis: Redis | null = null;
  private redisSub: Redis | null = null;
  /** jobName → configuração com que o cron foi registrado */
  private readonly cronJobs = new Map<
    string,
    { instCodigo: number; cronExpr: string; fusoHorario: number }
  >();

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
        this.logger.warn('Redis indisponível — lock distribuído do sync scheduler desligado');
        this.redis = null;
      });

      this.redisSub = new Redis({ ...getRedisConnectionOptions(), lazyConnect: true });
      this.redisSub.connect().then(() => {
        this.redisSub!.subscribe(channelSyncSchedulerRefresh(), (err) => {
          if (err) this.logger.error('Erro ao subscrever canal sync refresh', err);
        });
        this.redisSub!.on('message', (_channel, _msg) => {
          this.reconcileSchedules().catch((e) =>
            this.logger.error('Erro ao reconciliar schedules sync', e),
          );
        });
      }).catch(() => {
        this.logger.warn('Redis indisponível — scheduler sync não receberá atualizações em tempo real');
      });
    } catch {
      this.logger.warn('Redis não configurado para o sync scheduler');
    }
  }

  async reconcileSchedules() {
    try {
      const instituicoes = await this.prisma.iNSInstituicao.findMany({
        where: { INSAtivo: true, INSSyncRegistrosDiarios: true, INSWorkerAtivo: true },
        select: { INSCodigo: true, INSTempoSync: true, INSFusoHorario: true },
      });

      const activeIds = new Set(instituicoes.map((i) => i.INSCodigo));

      for (const [name, cfg] of this.cronJobs.entries()) {
        if (!activeIds.has(cfg.instCodigo)) {
          this.removeCronJob(name);
        }
      }

      for (const inst of instituicoes) {
        const name = this.jobName(inst.INSCodigo);
        const cronExpr = inst.INSTempoSync || '0 9,15,22 * * *';
        const fusoHorario = inst.INSFusoHorario ?? -3;

        const existing = this.cronJobs.get(name);
        if (existing !== undefined) {
          // Se a expressão ou o fuso mudaram, recriar o job
          try {
            this.schedulerRegistry.getCronJob(name);
            if (existing.cronExpr !== cronExpr || existing.fusoHorario !== fusoHorario) {
              this.removeCronJob(name);
            } else {
              continue;
            }
          } catch {
            this.cronJobs.delete(name);
          }
        }

        this.registerCronJob(inst.INSCodigo, cronExpr, fusoHorario);
      }

      this.logger.log(`Sync scheduler reconciliado: ${this.cronJobs.size} instituições agendadas`);
    } catch (err) {
      this.logger.error('Erro ao reconciliar schedules', err);
    }
  }

  private registerCronJob(instCodigo: number, cronExpr: string, fusoHorario: number) {
    const name = this.jobName(instCodigo);
    try {
      // utcOffset (em minutos) faz o cron disparar no fuso da instituição —
      // é exclusivo com timeZone, por isso o parâmetro de timezone vai como null.
      const job = new CronJob(
        cronExpr,
        () => this.onTick(instCodigo),
        null,
        true,
        null,
        null,
        false,
        fusoHorario * 60,
      );
      this.schedulerRegistry.addCronJob(name, job as any);
      job.start();
      this.cronJobs.set(name, { instCodigo, cronExpr, fusoHorario });
      this.logger.log(
        `Cron de sync registrado: inst=${instCodigo} expr="${cronExpr}" fuso=UTC${fusoHorario >= 0 ? '+' : ''}${fusoHorario}`,
      );
    } catch (err) {
      this.logger.error(`Erro ao registrar cron para inst=${instCodigo} expr="${cronExpr}": ${err}`);
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
    const lockKey = `${SYNC_LOCK_KEY_PREFIX}:${instCodigo}`;
    if (this.redis) {
      const acquired = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL_SEC, 'NX');
      if (acquired !== 'OK') return; // outra instância da API já está processando
    }

    try {
      const inst = await this.prisma.iNSInstituicao.findUnique({
        where: { INSCodigo: instCodigo },
        select: { INSTempoSync: true, INSFusoHorario: true },
      });
      const cronExpr = inst?.INSTempoSync || '0 9,15,22 * * *';
      const fusoHorario = inst?.INSFusoHorario ?? -3;
      const now = new Date();
      const isLastRunOfDay = isLastScheduledHour(cronExpr, now, fusoHorario);

      await this.queueService.publishRegistroDiarioSyncJob(instCodigo, isLastRunOfDay);
      this.logger.log(
        `INTERNAL sync job enfileirado para inst=${instCodigo} isLastRunOfDay=${isLastRunOfDay}`,
      );
    } catch (err) {
      this.logger.error(`Erro no tick de sync para inst=${instCodigo}`, err);
    }
  }

  private jobName(instCodigo: number) {
    return `rpd-sync-${instCodigo}`;
  }
}
