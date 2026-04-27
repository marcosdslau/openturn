import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../common/redis/redis-connection';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import { ProcessManager } from '../rotina/engine/process-manager';
import { MonitorSnapshotBuilder } from './monitor-snapshot.builder';
import {
  MONITOR_INST_DASHBOARD_CACHE_VERSION,
  MONITOR_SNAPSHOT_VERSION,
  type MonitorInstituicaoDashboardExtrasCacheDto,
  MonitorSnapshotDto,
  redisKeyMonitorInstDashboard,
  redisMonitorInstDashboardPattern,
} from './monitor-snapshot.types';
import {
  redisMonitorSnapshot,
  redisMonitorRefreshLock,
} from '../common/redis/redis-keys';

const LOCK_TTL_SEC = 300;

@Injectable()
export class MonitorSnapshotService {
  private readonly logger = new Logger(MonitorSnapshotService.name);
  private redis: Redis | null = null;

  constructor(
    private readonly builder: MonitorSnapshotBuilder,
    private readonly rotinaQueueService: RotinaQueueService,
    private readonly processManager: ProcessManager,
  ) {
    try {
      const client = new Redis({
        ...getRedisConnectionOptions(),
        lazyConnect: true,
      });
      this.redis = client;
      client.connect().catch(() => {
        this.logger.warn(
          'Redis indisponível: snapshot do monitor usará apenas recálculo em memória',
        );
        void client.quit();
        this.redis = null;
      });
    } catch {
      this.redis = null;
    }
  }

  private monitorTz(): string {
    return process.env.MONITOR_SNAPSHOT_TZ?.trim() || 'America/Sao_Paulo';
  }

  async loadFromRedis(): Promise<MonitorSnapshotDto | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(redisMonitorSnapshot());
      if (!raw) return null;
      return JSON.parse(raw) as MonitorSnapshotDto;
    } catch (e) {
      this.logger.warn(`Falha ao ler snapshot Redis: ${(e as Error).message}`);
      return null;
    }
  }

  private instDashboardTtlSec(): number {
    return Math.max(
      60,
      parseInt(process.env.MONITOR_INST_DASHBOARD_TTL_SEC || '3600', 10),
    );
  }

  private async invalidateInstituicaoDashboardCaches(): Promise<void> {
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys(redisMonitorInstDashboardPattern());
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(
          `Caches dashboard instituição invalidados (${keys.length})`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Falha ao invalidar caches dashboard instituição: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Read-through Redis para complemento do dashboard por instituição (série + contagens Prisma).
   */
  async getInstituicaoDashboardExtrasCached(
    instituicaoCodigo: number,
    build: () => Promise<MonitorInstituicaoDashboardExtrasCacheDto>,
  ): Promise<MonitorInstituicaoDashboardExtrasCacheDto> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(
          redisKeyMonitorInstDashboard(instituicaoCodigo),
        );
        if (raw) {
          const parsed = JSON.parse(
            raw,
          ) as MonitorInstituicaoDashboardExtrasCacheDto;
          if (parsed.version === MONITOR_INST_DASHBOARD_CACHE_VERSION) {
            return parsed;
          }
        }
      } catch (e) {
        this.logger.warn(
          `Falha ao ler cache dashboard inst: ${(e as Error).message}`,
        );
      }
    }

    const dto = await build();

    if (this.redis) {
      try {
        await this.redis.set(
          redisKeyMonitorInstDashboard(instituicaoCodigo),
          JSON.stringify(dto),
          'EX',
          this.instDashboardTtlSec(),
        );
      } catch (e) {
        this.logger.warn(
          `Falha ao gravar cache dashboard inst: ${(e as Error).message}`,
        );
      }
    }

    return dto;
  }

  private async persist(dto: MonitorSnapshotDto): Promise<void> {
    if (!this.redis) return;
    try {
      const body = JSON.stringify(dto);
      await this.redis.set(redisMonitorSnapshot(), body);
      this.logger.log(
        `Snapshot monitor gravado (${Math.round(body.length / 1024)} KiB)`,
      );
      await this.invalidateInstituicaoDashboardCaches();
    } catch (e) {
      this.logger.warn(
        `Falha ao gravar snapshot Redis: ${(e as Error).message}`,
      );
    }
  }

  private async tryAcquireLock(): Promise<boolean> {
    if (!this.redis) return true;
    try {
      const ok = await this.redis.set(
        redisMonitorRefreshLock(),
        '1',
        'EX',
        LOCK_TTL_SEC,
        'NX',
      );
      return ok === 'OK';
    } catch {
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(redisMonitorRefreshLock());
    } catch {
      // ignore
    }
  }

  async buildSnapshotPayload(): Promise<MonitorSnapshotDto> {
    const t0 = Date.now();
    const now = new Date();
    const queueCounts = await this.rotinaQueueService.getJobCounts();
    const runningNow = this.processManager.getActiveCount();
    const queue: MonitorSnapshotDto['queue'] = {
      ...queueCounts,
      running: runningNow,
      totalActive: (queueCounts.active || 0) + runningNow,
    };

    const core = await this.builder.build({
      now,
      queue,
      timezone: this.monitorTz(),
    });

    return {
      version: MONITOR_SNAPSHOT_VERSION,
      generatedAt: now.toISOString(),
      refreshDurationMs: Date.now() - t0,
      ...core,
    };
  }

  /**
   * Recalcula e grava no Redis. Se force=false e lock não obtido, lança Conflict.
   */
  async refreshSnapshot(options: {
    force: boolean;
  }): Promise<MonitorSnapshotDto> {
    const acquired = await this.tryAcquireLock();
    if (!acquired) {
      if (options.force) {
        throw new ConflictException(
          'Atualização do monitor já em andamento; tente em instantes.',
        );
      }
      const cached = await this.loadFromRedis();
      if (cached) return cached;
      throw new ServiceUnavailableException(
        'Snapshot indisponível e refresh ocupado.',
      );
    }

    try {
      const dto = await this.buildSnapshotPayload();
      await this.persist(dto);
      return dto;
    } finally {
      await this.releaseLock();
    }
  }

  /** Cron / cold-start sem erro de lock: ignora se outro nodo estiver refrescando */
  async refreshSnapshotBestEffort(): Promise<void> {
    const acquired = await this.tryAcquireLock();
    if (!acquired) {
      this.logger.debug('Monitor snapshot: lock ocupado, pulando ciclo');
      return;
    }
    try {
      const dto = await this.buildSnapshotPayload();
      await this.persist(dto);
    } catch (e) {
      this.logger.error(
        `Monitor snapshot refresh falhou: ${(e as Error).message}`,
        (e as Error).stack,
      );
    } finally {
      await this.releaseLock();
    }
  }

  async getOrRefresh(): Promise<MonitorSnapshotDto> {
    const cached = await this.loadFromRedis();
    if (cached?.version === MONITOR_SNAPSHOT_VERSION) {
      return cached;
    }
    this.logger.log('Snapshot monitor ausente ou versão antiga; recalculando…');
    try {
      return await this.refreshSnapshot({ force: true });
    } catch (e) {
      const again = await this.loadFromRedis();
      if (again?.version === MONITOR_SNAPSHOT_VERSION) {
        return again;
      }
      throw e;
    }
  }
}
