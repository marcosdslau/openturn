import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { getMainQueueName } from '../common/rabbit/rabbit-connection';
import { RabbitManagementService } from '../common/rabbit/rabbit-management.service';
import { RotinaQueueService } from '../rotina/queue/rotina-queue.service';
import { MonitorSnapshotBuilder } from './monitor-snapshot.builder';
import { MonitorSnapshotService } from './monitor-snapshot.service';
import type {
    InstituicaoRankingEntry,
    JanelaStatus,
    MonitorInstituicaoDashboardDto,
    StatusExecucaoKey,
} from './monitor-snapshot.types';
import { MONITOR_SNAPSHOT_VERSION } from './monitor-snapshot.types';

const JANELAS_STATUS: JanelaStatus[] = ['5d', '10d', '15d', '30d', '60d'];
const STATUS_KEYS: StatusExecucaoKey[] = [
    'EM_EXECUCAO',
    'SUCESSO',
    'ERRO',
    'TIMEOUT',
    'CANCELADO',
];

function filterRankingsParaInstituicao(
    rankings: MonitorInstituicaoDashboardDto['rankingsGlobaisPorStatus'],
    codigo: number,
): MonitorInstituicaoDashboardDto['rankingsGlobaisPorStatus'] {
    const out = {} as MonitorInstituicaoDashboardDto['rankingsGlobaisPorStatus'];
    for (const j of JANELAS_STATUS) {
        out[j] = {} as Record<StatusExecucaoKey, InstituicaoRankingEntry[]>;
        for (const sk of STATUS_KEYS) {
            const list = rankings[j]?.[sk] ?? [];
            const self = list.find((e) => e.codigo === codigo);
            out[j][sk] = self ? [self] : [];
        }
    }
    return out;
}

@Injectable()
export class MonitorInstituicaoDashboardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly monitorSnapshotService: MonitorSnapshotService,
        private readonly builder: MonitorSnapshotBuilder,
        private readonly rotinaQueueService: RotinaQueueService,
        private readonly rabbitMgmtService: RabbitManagementService,
    ) {}

    private monitorTz(): string {
        return process.env.MONITOR_SNAPSHOT_TZ?.trim() || 'America/Sao_Paulo';
    }

    async getDashboard(instituicaoCodigo: number): Promise<MonitorInstituicaoDashboardDto> {
        const exists = await this.prisma.iNSInstituicao.findUnique({
            where: { INSCodigo: instituicaoCodigo },
            select: { INSCodigo: true },
        });
        if (!exists) {
            throw new NotFoundException('Instituição não encontrada');
        }

        const t0 = Date.now();
        const now = new Date();
        const tz = this.monitorTz();

        let snapshot = await this.monitorSnapshotService.loadFromRedis();
        if (!snapshot || snapshot.version !== MONITOR_SNAPSHOT_VERSION) {
            snapshot = await this.monitorSnapshotService.getOrRefresh();
        }

        const inst = snapshot.instituicoes.find((i) => i.codigo === instituicaoCodigo);
        if (!inst) {
            throw new NotFoundException(
                'Instituição não encontrada no snapshot do monitor. Tente após a próxima atualização agendada ou peça um refresh do monitor.',
            );
        }

        const extras = await this.monitorSnapshotService.getInstituicaoDashboardExtrasCached(
            instituicaoCodigo,
            () => this.builder.buildInstituicaoDashboardExtras(instituicaoCodigo, now, tz),
        );

        const [waiting, active, rabbit] = await Promise.all([
            this.rotinaQueueService.getMainQueueMessageCount(instituicaoCodigo),
            this.rotinaQueueService.getInflightCountForInstitution(instituicaoCodigo),
            this.rabbitMgmtService.getQueueDetail(getMainQueueName(instituicaoCodigo)),
        ]);

        const rankingsGlobaisPorStatus = filterRankingsParaInstituicao(
            snapshot.rankingsGlobaisPorStatus,
            instituicaoCodigo,
        );

        return {
            version: snapshot.version,
            generatedAt: snapshot.generatedAt,
            refreshDurationMs: Date.now() - t0,
            instituicao: inst,
            counts: {
                clientes: 1,
                instituicoes: 1,
                pessoas: inst.pessoas,
                matriculas: inst.matriculas,
                equipamentos: extras.counts.equipamentos,
                rotinas: extras.counts.rotinas,
                execucoes: extras.counts.execucoes,
            },
            queue: {
                waiting,
                active,
                completed: extras.queueHistory.completed,
                failed: extras.queueHistory.failed,
                delayed: 0,
                paused: 0,
                prioritized: 0,
                running: 0,
                totalActive: active,
            },
            serieExecucoesInstituicao: extras.serieExecucoesInstituicao,
            rankingsGlobaisPorStatus,
            rabbit: {
                queue_name: rabbit.queue_name,
                messages_ready: rabbit.messages_ready,
                messages_unacknowledged: rabbit.messages_unacknowledged,
                messages_total: rabbit.messages_total,
                publish_rate: rabbit.publish_rate,
                deliver_rate: rabbit.deliver_rate,
                timestamp: rabbit.timestamp,
            },
        };
    }
}
