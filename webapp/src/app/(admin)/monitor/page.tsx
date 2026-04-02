"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
    MonitorService,
    MonitorSnapshot,
    JanelaStatus,
    SeriePeriodo,
    JanelaCurta,
    JanelaDuracao,
    StatusExecucaoKey,
    StatusContagem,
    InstituicaoMonitorSnapshot,
    RabbitOverview,
} from "@/services/monitor.service";
import {
    GroupIcon,
    BoxCubeIcon,
    PieChartIcon,
    TaskIcon,
    ListIcon,
    RefreshIcon,
    BoltIcon,
} from "@/icons";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const JANELAS_CURTAS: JanelaCurta[] = ["1h", "4h", "8h", "16h", "24h", "36h"];
const JANELAS_STATUS: JanelaStatus[] = ["5d", "10d", "15d", "30d", "60d"];
const JANELAS_DUR: JanelaDuracao[] = ["1d", "2d", "5d", "10d", "15d", "30d"];
const STATUS_ORDER: StatusExecucaoKey[] = [
    "SUCESSO",
    "ERRO",
    "TIMEOUT",
    "CANCELADO",
    "EM_EXECUCAO",
];
const STATUS_LABEL: Record<StatusExecucaoKey, string> = {
    SUCESSO: "Sucesso",
    ERRO: "Erro",
    TIMEOUT: "Timeout",
    CANCELADO: "Cancelado",
    EM_EXECUCAO: "Em execução",
};

function emptyStatusContagem(): StatusContagem {
    return {
        EM_EXECUCAO: 0,
        SUCESSO: 0,
        ERRO: 0,
        TIMEOUT: 0,
        CANCELADO: 0,
    };
}

function formatDurationMs(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)} s`;
    const m = s / 60;
    if (m < 60) return `${m.toFixed(1)} min`;
    const h = m / 60;
    return `${h.toFixed(2)} h`;
}

export default function MonitorPage() {
    const { isSuperRoot, isAdmin, loading: authLoading } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<MonitorSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedInst, setSelectedInst] = useState<number | null>(null);
    const [pieJanela, setPieJanela] = useState<JanelaStatus>("10d");
    const [seriePeriodo, setSeriePeriodo] = useState<SeriePeriodo>("24h");
    const [rankJanela, setRankJanela] = useState<JanelaStatus>("10d");
    const [duracaoJanela, setDuracaoJanela] = useState<JanelaDuracao>("10d");
    const [topCurtaTab, setTopCurtaTab] = useState<JanelaCurta>("24h");

    const loadStats = useCallback(async () => {
        try {
            const data = await MonitorService.getStats();
            setStats(data);
        } catch (error) {
            console.error("Erro ao carregar monitor:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleForceRefresh = async () => {
        setRefreshing(true);
        try {
            const data = await MonitorService.refreshSnapshot();
            setStats(data);
        } catch (e) {
            console.error("Atualização forçada falhou:", e);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (!authLoading && !isSuperRoot && !isAdmin) {
            router.push("/");
            return;
        }
        loadStats();
    }, [isSuperRoot, isAdmin, authLoading, router, loadStats]);

    useEffect(() => {
        if (stats?.instituicoes.length && selectedInst == null) {
            setSelectedInst(stats.instituicoes[0].codigo);
        }
    }, [stats, selectedInst]);

    const instSelecionada: InstituicaoMonitorSnapshot | undefined = useMemo(() => {
        if (!stats || selectedInst == null) return undefined;
        return stats.instituicoes.find((i) => i.codigo === selectedInst);
    }, [stats, selectedInst]);

    const routineOptions: ApexOptions = useMemo(
        () => ({
            colors: ["#3641f5", "#fbbf24"],
            labels: ["Webhooks", "Schedules"],
            chart: { type: "donut", fontFamily: "Outfit, sans-serif" },
            plotOptions: {
                pie: {
                    donut: {
                        size: "70%",
                        labels: {
                            show: true,
                            total: {
                                show: true,
                                label: "Total",
                                formatter: () => String(stats?.counts.rotinas.total ?? 0),
                            },
                        },
                    },
                },
            },
            legend: { position: "bottom" },
        }),
        [stats?.counts.rotinas.total],
    );

    const queueOptions: ApexOptions = useMemo(
        () => ({
            colors: ["#3b82f6", "#10b981", "#ef4444", "#6366f1", "#fbbf24"],
            chart: { type: "bar", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
            xaxis: {
                categories: ["Aguardando", "Ativos (DB)", "Falhas (hist.)", "Atrasados", "Sucesso (hist.)"],
            },
            plotOptions: {
                bar: { borderRadius: 4, columnWidth: "60%", distributed: true },
            },
            legend: { show: false },
        }),
        [],
    );

    const queueSeries = useMemo(() => {
        if (!stats) return [{ name: "Jobs", data: [0, 0, 0, 0, 0] }];
        return [
            {
                name: "Jobs",
                data: [
                    (stats.queue.waiting || 0) + (stats.queue.prioritized || 0),
                    stats.queue.active || 0,
                    stats.queue.failed || 0,
                    stats.queue.delayed || 0,
                    stats.queue.completed || 0,
                ],
            },
        ];
    }, [stats]);

    const heatmapSeries = useMemo(() => {
        if (!stats) return [];
        return stats.instituicoes.map((i) => ({
            name: i.nome,
            data: JANELAS_CURTAS.map((j) => ({
                x: j,
                y: i.execucoesPorJanelaCurta[j],
            })),
        }));
    }, [stats]);

    const heatmapOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: "heatmap",
                fontFamily: "Outfit, sans-serif",
                toolbar: { show: false },
            },
            dataLabels: { enabled: false },
            colors: ["#6366f1"], // Indigo base
            plotOptions: {
                heatmap: {
                    shadeIntensity: 0.5,
                    radius: 4,
                    useFillColorAsStroke: false,
                    colorScale: {
                        ranges: [
                            { from: 0, to: 0, color: "#f3f4f6", name: "Nenhuma" },
                            { from: 1, to: 10, color: "#eef2ff", name: "Baixíssimo" },
                            { from: 11, to: 50, color: "#c7d2fe", name: "Muito Baixo" },
                            { from: 51, to: 200, color: "#818cf8", name: "Baixo" },
                            { from: 201, to: 1000, color: "#4f46e5", name: "Médio" },
                            { from: 1001, to: 5000, color: "#4338ca", name: "Alto" },
                            { from: 5001, to: 1000000000, color: "#312e81", name: "Crítico" },
                        ],
                    },
                },
            },
            xaxis: {
                type: "category",
                categories: JANELAS_CURTAS,
                position: "top",
                axisBorder: { show: false },
                axisTicks: { show: false },
            },
            yaxis: {
                labels: {
                    maxWidth: 180,
                    style: { colors: "#9ca3af", fontSize: "10px" },
                },
            },
            title: {
                text: "Mapa de Calor: Frequência por Instituição e Janela",
                align: "left",
                style: { fontSize: "16px", fontWeight: 600, color: "#6b7280" },
            },
            grid: { padding: { right: 20 } },
            legend: { position: "bottom", horizontalAlign: "center" },
            tooltip: {
                y: {
                    formatter: (v: number) => `${v.toLocaleString()} execuções`,
                },
            },
        }),
        [],
    );

    const duracaoRanking = useMemo(() => {
        if (!stats) return [];
        return [...stats.instituicoes]
            .map((i) => ({
                codigo: i.codigo,
                nome: i.nome,
                ms: i.tempoProcessamentoMsPorJanela[duracaoJanela],
            }))
            .filter((x) => x.ms > 0)
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 20);
    }, [stats, duracaoJanela]);

    const duracaoBarOptions: ApexOptions = useMemo(
        () => ({
            chart: { type: "bar", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
            plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
            xaxis: { categories: duracaoRanking.map((d) => d.nome.slice(0, 28)) },
            dataLabels: { formatter: (v: number) => formatDurationMs(v as number) },
            tooltip: { y: { formatter: (v: number) => formatDurationMs(v) } },
            colors: ["#6366f1"],
        }),
        [duracaoRanking],
    );

    const serieSelecionada = useMemo(() => {
        if (!stats) return null;
        return stats.serieExecucoesPlataforma.find((s) => s.periodo === seriePeriodo) ?? null;
    }, [stats, seriePeriodo]);

    const serieOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: "area",
                fontFamily: "Outfit, sans-serif",
                toolbar: { show: false },
                zoom: { enabled: false },
            },
            stroke: { curve: "smooth", width: 2 },
            fill: {
                type: "gradient",
                gradient: { shadeIntensity: 0.45, opacityFrom: 0.5, opacityTo: 0.05 },
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories:
                    serieSelecionada?.buckets.map((b) => {
                        if (b.bucketStart.length === 10) {
                            const [y, m, d] = b.bucketStart.split("-");
                            return `${d}/${m}/${y} 00:00:00`;
                        }
                        const date = new Date(b.bucketStart);
                        if (isNaN(date.getTime())) return b.bucketStart;
                        const day = String(date.getDate()).padStart(2, "0");
                        const month = String(date.getMonth() + 1).padStart(2, "0");
                        const year = date.getFullYear();
                        const hours = String(date.getHours()).padStart(2, "0");
                        const minutes = String(date.getMinutes()).padStart(2, "0");
                        const seconds = String(date.getSeconds()).padStart(2, "0");
                        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
                    }) ?? [],
                labels: { rotate: serieSelecionada?.granularity === "hour" ? -45 : 0 },
            },
            yaxis: { title: { text: "Execuções (cumulativo)" } },
            colors: ["#0ea5e9"],
        }),
        [serieSelecionada],
    );

    const pieOptions: ApexOptions | null = useMemo(() => {
        if (!instSelecionada) return null;
        const st = instSelecionada.statusPorJanela[pieJanela] || emptyStatusContagem();
        return {
            chart: { type: "donut", fontFamily: "Outfit, sans-serif" },
            labels: STATUS_ORDER.map((k) => STATUS_LABEL[k]),
            colors: ["#22c55e", "#ef4444", "#f97316", "#94a3b8", "#3b82f6"],
            legend: { position: "bottom" },
            plotOptions: {
                pie: {
                    donut: {
                        size: "65%",
                        labels: {
                            show: true,
                            total: {
                                show: true,
                                label: "Execuções",
                                formatter: () =>
                                    String(STATUS_ORDER.reduce((a, k) => a + (st[k] || 0), 0)),
                            },
                        },
                    },
                },
            },
        };
    }, [instSelecionada, pieJanela]);

    const pieSeries = useMemo(() => {
        if (!instSelecionada) return [];
        const st = instSelecionada.statusPorJanela[pieJanela] || emptyStatusContagem();
        return STATUS_ORDER.map((k) => st[k] || 0);
    }, [instSelecionada, pieJanela]);

    const pieTotal = useMemo(() => {
        return pieSeries.reduce((a, b) => a + b, 0);
    }, [pieSeries]);

    if (authLoading || loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <RefreshIcon className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!stats) return null;

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white/90">
                        Monitor Global
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Dados agregados (Redis). Atualização automática 04h, 10h, 16h e 22h.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <span className="text-xs text-gray-400">
                        Gerado em: {new Date(stats.generatedAt).toLocaleString()}
                        {stats.refreshDurationMs != null && (
                            <span className="ml-2">({stats.refreshDurationMs} ms)</span>
                        )}
                    </span>
                    <button
                        type="button"
                        disabled={refreshing}
                        onClick={() => void handleForceRefresh()}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        Atualizar agora
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                    title="Fila (Aguardando)"
                    value={stats.queue.waiting || 0}
                    icon={<ListIcon className="text-blue-500" />}
                    subtitle="Mensagens no RabbitMQ"
                />
                <StatCard
                    title="Processando (snapshot)"
                    value={stats.queue.totalActive || 0}
                    icon={<BoltIcon className="text-amber-500" />}
                    subtitle={`${stats.queue.active || 0} workers + ${stats.queue.running || 0} local`}
                />
                <StatCard
                    title="Pessoas (plataforma)"
                    value={stats.counts.pessoas}
                    icon={<GroupIcon className="text-purple-500" />}
                    subtitle="Todas as instituições"
                />
                <StatCard
                    title="Matrículas (plataforma)"
                    value={stats.counts.matriculas}
                    icon={<TaskIcon className="text-green-500" />}
                    subtitle="Total"
                />
                <StatCard
                    title="Execuções hoje / total"
                    value={stats.counts.execucoes.hoje}
                    icon={<PieChartIcon className="text-emerald-500" />}
                    subtitle={`Total histórico: ${stats.counts.execucoes.total.toLocaleString()}`}
                />
            </div>

            {/* Detalhe por instituição: pizza + top rotinas */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-6 flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Detalhe por instituição
                    </h3>
                    <select
                        value={selectedInst ?? ""}
                        onChange={(e) => setSelectedInst(Number(e.target.value))}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                        {stats.instituicoes.map((i) => (
                            <option key={i.codigo} value={i.codigo}>
                                {i.nome}
                            </option>
                        ))}
                    </select>
                    <select
                        value={pieJanela}
                        onChange={(e) => setPieJanela(e.target.value as JanelaStatus)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                        {JANELAS_STATUS.map((j) => (
                            <option key={j} value={j}>
                                Pizza: últimos {j}
                            </option>
                        ))}
                    </select>
                </div>

                {instSelecionada && pieOptions ? (
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <div>
                            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                <PieChartIcon className="h-6 w-6" />
                                Distribuição por status
                            </h4>
                            {pieTotal > 0 ? (
                                <ReactApexChart options={pieOptions} series={pieSeries} type="donut" height={280} />
                            ) : (
                                <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                                    <PieChartIcon className="mb-2 h-10 w-10 text-gray-300 dark:text-gray-700" />
                                    <p className="text-sm text-gray-400">Sem dados no período</p>
                                </div>
                            )}
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-white/50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                            <RabbitOverviewPanel />
                        </div>
                    </div>
                ) : null}

                {instSelecionada && (
                    <div className="mt-8 border-t border-gray-100 pt-6 dark:border-gray-800">
                        <h4 className="mb-3 text-sm font-semibold">Top rotinas por janela curta (até 20)</h4>
                        <div className="flex flex-wrap gap-2">
                            {JANELAS_CURTAS.map((j) => (
                                <button
                                    key={j}
                                    type="button"
                                    onClick={() => setTopCurtaTab(j)}
                                    className={`rounded-lg px-3 py-1 text-xs font-medium ${
                                        topCurtaTab === j
                                            ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                    }`}
                                >
                                    {j}
                                </button>
                            ))}
                        </div>
                        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                            {(instSelecionada.topRotinasPorJanelaCurta[topCurtaTab] ?? []).map((t) => (
                                <li key={t.rotinaCodigo} className="flex justify-between gap-2">
                                    <span className="truncate">{t.nome}</span>
                                    <span className="tabular-nums text-gray-500">{t.execucoes}</span>
                                </li>
                            ))}
                            {(instSelecionada.topRotinasPorJanelaCurta[topCurtaTab] ?? []).length ===
                                0 && <li className="text-gray-400">Sem dados</li>}
                        </ul>
                    </div>
                )}
            </div>

            {/* Série plataforma — estilo performance */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Execuções na plataforma (cumulativo)
                    </h3>
                    <select
                        value={seriePeriodo}
                        onChange={(e) => setSeriePeriodo(e.target.value as SeriePeriodo)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                        {(["10h", "24h", "5d", "15d", "30d"] as SeriePeriodo[]).map((p) => (
                            <option key={p} value={p}>
                                Últimas {p}
                            </option>
                        ))}
                    </select>
                </div>
                {serieSelecionada && serieSelecionada.buckets.length > 0 ? (
                    <ReactApexChart
                        options={serieOptions}
                        series={[
                            {
                                name: "Cumulativo",
                                data: serieSelecionada.buckets.map((b) => b.cumulative),
                            },
                        ]}
                        type="area"
                        height={320}
                    />
                ) : (
                    <p className="text-sm text-gray-500">Sem dados no período.</p>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                        Infraestrutura
                    </h3>
                    <div className="space-y-4">
                        <Row label="Clientes" value={stats.counts.clientes} />
                        <Row label="Instituições ativas" value={stats.counts.instituicoes} />
                        <Row label="Equipamentos" value={stats.counts.equipamentos} />
                        <Row label="Execuções hoje" value={stats.counts.execucoes.hoje} accent />
                        <Row label="Execuções total" value={stats.counts.execucoes.total} />
                    </div>
                </div>

                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                        Tipos de rotinas
                    </h3>
                    <div className="flex justify-center">
                        <ReactApexChart
                            options={routineOptions}
                            series={[stats.counts.rotinas.webhooks, stats.counts.rotinas.schedules]}
                            type="donut"
                            height={250}
                        />
                    </div>
                </div>

                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                        Fila / execução (RabbitMQ + log)
                    </h3>
                    <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                        Ativos = registros EM_EXECUCAO; sucesso/falha = histórico completo no banco.
                    </p>
                    <ReactApexChart options={queueOptions} series={queueSeries} type="bar" height={260} />
                </div>
            </div>

            {/* Instituições × janelas curtas */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                    Mapa de Calor: Execuções por Instituição
                </h3>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <ReactApexChart
                        className="w-full"
                        options={heatmapOptions}
                        series={heatmapSeries}
                        type="heatmap"
                        height={Math.max(250, stats.instituicoes.length * 60)}
                        width="100%"
                    />
                </div>

                <h3 className="mb-4 mt-8 text-lg font-semibold text-gray-800 dark:text-white/90">
                    Execuções por instituição (janelas recentes)
                </h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-800">
                                <th className="py-2 pr-4">Instituição</th>
                                {JANELAS_CURTAS.map((j) => (
                                    <th key={j} className="py-2 px-2 text-right">
                                        {j}
                                    </th>
                                ))}
                                <th className="py-2 pl-2 text-right">Pessoas</th>
                                <th className="py-2 pl-2 text-right">Matrículas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.instituicoes.map((i) => (
                                <tr
                                    key={i.codigo}
                                    className="border-b border-gray-100 dark:border-gray-800/80"
                                >
                                    <td className="py-2 pr-4 font-medium text-gray-800 dark:text-white/90">
                                        {i.nome}
                                    </td>
                                    {JANELAS_CURTAS.map((j) => (
                                        <td key={j} className="py-2 px-2 text-right tabular-nums">
                                            {i.execucoesPorJanelaCurta[j].toLocaleString()}
                                        </td>
                                    ))}
                                    <td className="py-2 pl-2 text-right tabular-nums">
                                        {i.pessoas.toLocaleString()}
                                    </td>
                                    <td className="py-2 pl-2 text-right tabular-nums">
                                        {i.matriculas.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tempo de processamento comparativo */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Tempo total de processamento por instituição (soma duração rotinas)
                    </h3>
                    <select
                        value={duracaoJanela}
                        onChange={(e) => setDuracaoJanela(e.target.value as JanelaDuracao)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                        {JANELAS_DUR.map((j) => (
                            <option key={j} value={j}>
                                Últimos {j}
                            </option>
                        ))}
                    </select>
                </div>
                {duracaoRanking.length > 0 ? (
                    <ReactApexChart
                        options={duracaoBarOptions}
                        series={[{ name: "ms", data: duracaoRanking.map((d) => d.ms) }]}
                        type="bar"
                        height={Math.max(280, duracaoRanking.length * 22)}
                    />
                ) : (
                    <p className="text-sm text-gray-500">Sem durações registradas no período.</p>
                )}
            </div>

            {/* Rankings globais por status */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Ranking de instituições por status de execução
                    </h3>
                    <select
                        value={rankJanela}
                        onChange={(e) => setRankJanela(e.target.value as JanelaStatus)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                        {JANELAS_STATUS.map((j) => (
                            <option key={j} value={j}>
                                Últimos {j}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {STATUS_ORDER.map((sk) => (
                        <div
                            key={sk}
                            className="rounded-xl border border-gray-100 p-4 dark:border-gray-800"
                        >
                            <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {STATUS_LABEL[sk]}
                            </h4>
                            <ol className="max-h-48 space-y-1 overflow-y-auto text-xs">
                                {(stats.rankingsGlobaisPorStatus[rankJanela]?.[sk] ?? [])
                                    .slice(0, 15)
                                    .map((r, idx) => (
                                        <li key={r.codigo} className="flex justify-between gap-2">
                                            <span className="text-gray-500">
                                                {idx + 1}. {r.nome.slice(0, 36)}
                                            </span>
                                            <span className="tabular-nums font-medium">
                                                {r.count.toLocaleString()}
                                            </span>
                                        </li>
                                    ))}
                                {(stats.rankingsGlobaisPorStatus[rankJanela]?.[sk] ?? []).length ===
                                    0 && (
                                    <li className="text-gray-400">Nenhuma</li>
                                )}
                            </ol>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400">
                <BoxCubeIcon className="h-6 w-6" />
                Snapshot v{stats.version} — Redis key monitor:global:snapshot:v1
            </div>
        </div>
    );
}

function RabbitOverviewPanel() {
    const [data, setData] = useState<RabbitOverview | null>(null);
    const [refreshInterval, setRefreshInterval] = useState<number>(5000);
    const [history, setHistory] = useState<{ publish: number[]; deliver: number[]; timestamps: string[] }>({
        publish: [],
        deliver: [],
        timestamps: [],
    });

    const fetchRabbitData = useCallback(async () => {
        try {
            const result = await MonitorService.getRabbitOverview();
            setData(result);
            
            setHistory(prev => {
                const newPublish = [...prev.publish, result.publish_rate].slice(-20);
                const newDeliver = [...prev.deliver, result.deliver_rate].slice(-20);
                const newTimestamps = [...prev.timestamps, new Date().toLocaleTimeString()].slice(-20);
                return { publish: newPublish, deliver: newDeliver, timestamps: newTimestamps };
            });
        } catch (error) {
            console.error("Erro ao buscar dados do RabbitMQ:", error);
        }
    }, []);

    useEffect(() => {
        fetchRabbitData();
        const interval = setInterval(fetchRabbitData, refreshInterval);
        return () => clearInterval(interval);
    }, [fetchRabbitData, refreshInterval]);

    const chartOptions: ApexOptions = {
        chart: {
            type: "area",
            height: 200,
            sparkline: { enabled: false },
            toolbar: { show: false },
            animations: { enabled: true, dynamicAnimation: { speed: 1000 } },
        },
        dataLabels: { enabled: false },
        stroke: { curve: "smooth", width: 2 },
        xaxis: {
            categories: history.timestamps,
            labels: { show: false },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: { labels: { show: true } },
        tooltip: { x: { show: true } },
        colors: ["#3b82f6", "#10b981"],
        legend: { position: "top", horizontalAlign: "right" },
        fill: {
            type: "gradient",
            gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1 },
        },
    };

    const chartSeries = [
        { name: "Publish Rate", data: history.publish },
        { name: "Deliver Rate", data: history.deliver },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90 flex items-center gap-2">
                    <BoltIcon className="h-6 w-6 text-amber-500" />
                    RabbitMQ Realtime
                </h4>
                <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="text-xs rounded border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
                >
                    <option value={5000}>5s</option>
                    <option value={15000}>15s</option>
                    <option value={60000}>1m</option>
                    <option value={180000}>3m</option>
                </select>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <MiniCard title="Queues" value={data?.queues ?? 0} />
                <MiniCard title="Ready" value={data?.messages_ready ?? 0} />
                <MiniCard title="Unacked" value={data?.messages_unacknowledged ?? 0} />
                <MiniCard title="Publish" value={`${data?.publish_rate?.toFixed(1) ?? 0}/s`} />
                <MiniCard title="Deliver" value={`${data?.deliver_rate?.toFixed(1) ?? 0}/s`} />
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-2 dark:border-gray-800 dark:bg-black/20">
                <ReactApexChart options={chartOptions} series={chartSeries} type="area" height={180} />
            </div>
        </div>
    );
}

function MiniCard({ title, value }: { title: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {title}
            </p>
            <p className="mt-1 text-lg font-bold text-gray-800 dark:text-white">
                {value}
            </p>
        </div>
    );
}

function Row({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
    return (
        <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
            <span className="text-gray-500">{label}</span>
            <span
                className={`font-bold text-gray-800 dark:text-white ${accent ? "text-green-600 dark:text-green-400" : ""}`}
            >
                {value.toLocaleString()}
            </span>
        </div>
    );
}

function StatCard({
    title,
    value,
    icon,
    subtitle,
}: {
    title: string;
    value: number;
    icon: React.ReactNode;
    subtitle: string;
}) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800">
                    {icon}
                </div>
            </div>
            <div className="mt-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
                <h4 className="text-2xl font-bold text-gray-800 dark:text-white/90">
                    {value.toLocaleString()}
                </h4>
                <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
            </div>
        </div>
    );
}
