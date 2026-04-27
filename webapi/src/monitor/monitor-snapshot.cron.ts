import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MonitorSnapshotService } from './monitor-snapshot.service';

@Injectable()
export class MonitorSnapshotCronService {
  private readonly logger = new Logger(MonitorSnapshotCronService.name);

  constructor(
    private readonly monitorSnapshotService: MonitorSnapshotService,
  ) {}

  /** 04:00, 10:00, 16:00 e 22:00 no fuso configurado (padrão America/Sao_Paulo). */
  @Cron('0 0 4,10,16,22 * * *', {
    timeZone: process.env.MONITOR_CRON_TZ?.trim() || 'America/Sao_Paulo',
  })
  handleScheduledSnapshot(): void {
    this.logger.log('Cron: atualizando snapshot do monitor…');
    void this.monitorSnapshotService.refreshSnapshotBestEffort();
  }
}
