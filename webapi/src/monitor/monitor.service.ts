import { Injectable } from '@nestjs/common';
import { MonitorSnapshotService } from './monitor-snapshot.service';
import { MonitorSnapshotDto } from './monitor-snapshot.types';

@Injectable()
export class MonitorService {
    constructor(private readonly monitorSnapshotService: MonitorSnapshotService) { }

    async getGlobalStats(): Promise<MonitorSnapshotDto> {
        return this.monitorSnapshotService.getOrRefresh();
    }

    async forceRefreshSnapshot(): Promise<MonitorSnapshotDto> {
        return this.monitorSnapshotService.refreshSnapshot({ force: true });
    }
}
