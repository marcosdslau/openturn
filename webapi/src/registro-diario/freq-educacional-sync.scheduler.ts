import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../common/prisma/prisma.service';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import { channelSyncSchedulerRefresh } from '../common/redis/redis-keys';
import { isLastScheduledHour, localDayIsoDate } from './cron-hour.utils';

const LOCK_TTL_SEC = 90;
const FREQ_LOCK_KEY_PREFIX = 'freq:erp:sync:cron:lock';

@Injectable()
export class FreqEducacionalSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FreqEducacionalSyncScheduler.name);
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
        select: { INSCodigo: true, INSTempoFreqEducacional: true, INSFusoHorario: true },
      });

      const activeIds = new Set(instituicoes.map((i) => i.INSCodigo));

      for (const [name, cfg] of this.cronJobs.entries()) {
        if (!activeIds.has(cfg.instCodigo)) {
          this.removeCronJob(name);
        }
      }

      for (const inst of instituicoes) {
        const name = this.jobName(inst.INSCodigo);
        const cronExpr = inst.INSTempoFreqEducacional || '58 23 * * *';
        const fusoHorario = inst.INSFusoHorario ?? -3;

        const existing = this.cronJobs.get(name);
        if (existing !== undefined) {
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

      this.logger.log(`Freq scheduler reconciliado: ${this.cronJobs.size} instituições agendadas`);
    } catch (err) {
      this.logger.error('Erro ao reconciliar schedules freq', err);
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
        `Cron de freq registrado: inst=${instCodigo} expr="${cronExpr}" fuso=UTC${fusoHorario >= 0 ? '+' : ''}${fusoHorario}`,
      );
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
      const inst = await this.prisma.iNSInstituicao.findUnique({
        where: { INSCodigo: instCodigo },
        select: { INSTempoFreqEducacional: true, INSFusoHorario: true },
      });
      const cronExpr = inst?.INSTempoFreqEducacional || '58 23 * * *';
      const fusoHorario = inst?.INSFusoHorario ?? -3;
      const now = new Date();

      // Dia alvo e fechamento são fixados aqui, na publicação: um consumo atrasado
      // (job das 23:58 processado 00:02) não pode reprocessar/fechar o dia errado.
      const diaAlvoLocal = localDayIsoDate(now, fusoHorario);
      const isLastRunOfDay = isLastScheduledHour(cronExpr, now, fusoHorario);

      // Sem gate por RPD pendente: é o próprio job que reprocessa o dia e produz os RPDs.
      await this.queueService.publishFreqEducacionalSyncJob(
        instCodigo,
        diaAlvoLocal,
        isLastRunOfDay,
      );
      this.logger.log(
        `FREQ_ERP_SYNC job enfileirado para inst=${instCodigo} dia=${diaAlvoLocal} isLastRunOfDay=${isLastRunOfDay}`,
      );
    } catch (err) {
      this.logger.error(`Erro no tick de freq sync para inst=${instCodigo}`, err);
    }
  }

  private jobName(instCodigo: number) {
    return `freq-erp-sync-${instCodigo}`;
  }
}
