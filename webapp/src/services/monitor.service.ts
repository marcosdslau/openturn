import { apiGet, apiPost } from "@/lib/api";

export interface ReprocessDeadLetterResult {
    republished: number;
    skippedInvalid: number;
    errors: string[];
}

export type JanelaCurta = "1h" | "4h" | "8h" | "16h" | "24h" | "36h";
export type JanelaDuracao = "1d" | "2d" | "5d" | "10d" | "15d" | "30d";
export type JanelaStatus = "5d" | "10d" | "15d" | "30d" | "60d";
export type SeriePeriodo = "10h" | "24h" | "5d" | "15d" | "30d";
export type StatusExecucaoKey =
    | "EM_EXECUCAO"
    | "SUCESSO"
    | "ERRO"
    | "TIMEOUT"
    | "CANCELADO";

export interface ExecucoesJanelaCurta {
    "1h": number;
    "4h": number;
    "8h": number;
    "16h": number;
    "24h": number;
    "36h": number;
}

export interface TempoProcessamentoJanelas {
    "1d": number;
    "2d": number;
    "5d": number;
    "10d": number;
    "15d": number;
    "30d": number;
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
    granularity: "hour" | "day";
    buckets: SerieBucket[];
}

export interface MonitorSnapshot {
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
    rankingsGlobaisPorStatus: Record<
        JanelaStatus,
        Record<StatusExecucaoKey, InstituicaoRankingEntry[]>
    >;
    serieExecucoesPlataforma: SeriePlataforma[];
}

export interface RabbitOverview {
    queues: number;
    messages_ready: number;
    messages_unacknowledged: number;
    publish_rate: number;
    deliver_rate: number;
    dlq_messages: number;
    retry_queue_messages: number;
    timestamp: string;
}

/** @deprecated use MonitorSnapshot */
export type MonitorStats = MonitorSnapshot;

export const MonitorService = {
    getStats: async () => apiGet<MonitorSnapshot>("/monitor/stats"),
    refreshSnapshot: async () => apiPost<MonitorSnapshot>("/monitor/refresh", {}),
    getRabbitOverview: async () => apiGet<RabbitOverview>("/monitor/rabbit-overview"),
    /** Operação pode ser longa; timeout do cliente 15 min (ver `api` `timeoutMs`). */
    reprocessDeadLetterQueue: async () =>
        apiPost<ReprocessDeadLetterResult>("/monitor/rabbit/reprocess-dlq", {}, { timeoutMs: 900_000 }),
};
