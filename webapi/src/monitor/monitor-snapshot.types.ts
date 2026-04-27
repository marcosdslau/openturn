import {
  redisMonitorInstDashboard,
  redisMonitorInstDashboardPattern,
} from '../common/redis/redis-keys';

/** Contrato snapshot monitor (Redis). version bump ao alterar forma do JSON. */
export const MONITOR_SNAPSHOT_VERSION = 1;

/** Complemento Redis do dashboard por instituição (série + contagens). Bump ao alterar JSON. */
export const MONITOR_INST_DASHBOARD_CACHE_VERSION = 1;

export {
  redisMonitorInstDashboard as redisKeyMonitorInstDashboard,
  redisMonitorInstDashboardPattern,
};

/** Payload gravado em `redisKeyMonitorInstDashboard` (read-through). */
export interface MonitorInstituicaoDashboardExtrasCacheDto {
  version: number;
  generatedAt: string;
  serieExecucoesInstituicao: SeriePlataforma[];
  counts: {
    execucoes: { hoje: number; total: number };
    rotinas: { total: number; schedules: number; webhooks: number };
    equipamentos: number;
  };
  queueHistory: {
    completed: number;
    failed: number;
  };
}

export type JanelaCurta = '1h' | '4h' | '8h' | '16h' | '24h' | '36h';
export type JanelaDuracao = '1d' | '2d' | '5d' | '10d' | '15d' | '30d';
export type JanelaStatus = '5d' | '10d' | '15d' | '30d' | '60d';
export type SeriePeriodo = '10h' | '24h' | '5d' | '15d' | '30d';

export type StatusExecucaoKey =
  | 'EM_EXECUCAO'
  | 'SUCESSO'
  | 'ERRO'
  | 'TIMEOUT'
  | 'CANCELADO';

export interface ExecucoesJanelaCurta {
  '1h': number;
  '4h': number;
  '8h': number;
  '16h': number;
  '24h': number;
  '36h': number;
}

export interface TempoProcessamentoJanelas {
  '1d': number;
  '2d': number;
  '5d': number;
  '10d': number;
  '15d': number;
  '30d': number;
}

export interface TopRotina {
  rotinaCodigo: number;
  nome: string;
  execucoes: number;
}

export interface StatusContagem {
  EM_EXECUCAO: number;
  SUCESSO: number;
  ERRO: number;
  TIMEOUT: number;
  CANCELADO: number;
}

export interface InstituicaoRankingEntry {
  codigo: number;
  nome: string;
  count: number;
}

export interface InstituicaoMonitorSnapshot {
  codigo: number;
  nome: string;
  pessoas: number;
  matriculas: number;
  execucoesPorJanelaCurta: ExecucoesJanelaCurta;
  /** Top 20 rotinas por volume em cada janela curta */
  topRotinasPorJanelaCurta: Record<JanelaCurta, TopRotina[]>;
  tempoProcessamentoMsPorJanela: TempoProcessamentoJanelas;
  topRotinas10d: TopRotina[];
  statusPorJanela: Record<JanelaStatus, StatusContagem>;
}

export interface SerieBucket {
  bucketStart: string;
  count: number;
  cumulative: number;
}

export interface SeriePlataforma {
  periodo: SeriePeriodo;
  granularity: 'hour' | 'day';
  buckets: SerieBucket[];
}

export interface MonitorSnapshotDto {
  version: number;
  generatedAt: string;
  refreshDurationMs?: number;
  counts: {
    clientes: number;
    instituicoes: number;
    pessoas: number;
    matriculas: number;
    equipamentos: number;
    rotinas: { total: number; schedules: number; webhooks: number };
    execucoes: { total: number; hoje: number };
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    prioritized: number;
    running: number;
    totalActive: number;
  };
  instituicoes: InstituicaoMonitorSnapshot[];
  /** Por janela e status: instituições ordenadas por volume (maior primeiro) */
  rankingsGlobaisPorStatus: Record<
    JanelaStatus,
    Record<StatusExecucaoKey, InstituicaoRankingEntry[]>
  >;
  serieExecucoesPlataforma: SeriePlataforma[];
}

/** Resposta `GET /instituicao/:id/monitor/dashboard`. */
export interface MonitorInstituicaoDashboardDto {
  version: number;
  generatedAt: string;
  refreshDurationMs?: number;
  instituicao: InstituicaoMonitorSnapshot;
  counts: {
    clientes: number;
    instituicoes: number;
    pessoas: number;
    matriculas: number;
    equipamentos: number;
    rotinas: { total: number; schedules: number; webhooks: number };
    execucoes: { total: number; hoje: number };
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    prioritized: number;
    running: number;
    totalActive: number;
  };
  serieExecucoesInstituicao: SeriePlataforma[];
  rankingsGlobaisPorStatus: Record<
    JanelaStatus,
    Record<StatusExecucaoKey, InstituicaoRankingEntry[]>
  >;
  rabbit: {
    queue_name: string;
    messages_ready: number;
    messages_unacknowledged: number;
    messages_total: number;
    publish_rate: number;
    deliver_rate: number;
    timestamp: string;
  };
}
