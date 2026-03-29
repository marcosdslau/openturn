import { apiGet } from "@/lib/api";

export interface MonitorStats {
    counts: {
        clientes: number;
        instituicoes: number;
        pessoas: number;
        matriculas: number;
        equipamentos: number;
        rotinas: {
            total: number;
            schedules: number;
            webhooks: number;
        };
        execucoes: {
            total: number;
            hoje: number;
        };
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
    timestamp: string;
}

export const MonitorService = {
    getStats: async () => {
        return apiGet<MonitorStats>("/monitor/stats");
    },
};
