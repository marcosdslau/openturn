"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api";
import {
    MonitorService,
    MonitorInstituicaoDashboard,
    JanelaStatus,
    SeriePeriodo,
    JanelaCurta,
    JanelaDuracao,
    StatusExecucaoKey,
    StatusContagem,
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

const STATUS_PIE_CHART_HEIGHT = 400;

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

interface Passagem {
    REGCodigo: number;
    REGAcao: string;
    REGDataHora: string;
    pessoa: { PESNome: string; PESDocumento: string | null };
    equipamento: { EQPDescricao: string | null };
}

export default function DashboardPage() {
    const { codigoInstituicao, instituicao } = useTenant();
    const { isSuperRoot, isAdmin } = useAuth();
    const [dash, setDash] = useState<MonitorInstituicaoDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [pieJanela, setPieJanela] = useState<JanelaStatus>("10d");
    const [seriePeriodo, setSeriePeriodo] = useState<SeriePeriodo>("24h");
    const [rankJanela, setRankJanela] = useState<JanelaStatus>("10d");
    const [duracaoJanela, setDuracaoJanela] = useState<JanelaDuracao>("10d");
    const [topCurtaTab, setTopCurtaTab] = useState<JanelaCurta>("24h");

    const [recentes, setRecentes] = useState<Passagem[]>([]);
    const [passagensLoading, setPassagensLoading] = useState(true);

    const loadDashboard = useCallback(async () => {
        try {
            const data = await MonitorService.getInstituicaoDashboard(codigoInstituicao);
            setDash(data);
        } catch (e) {
            console.error("Erro ao carregar dashboard da instituição:", e);
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao]);

    const handleForceRefresh = async () => {
        setRefreshing(true);
        try {
            await MonitorService.refreshSnapshot();
            const data = await MonitorService.getInstituicaoDashboard(codigoInstituicao);
            setDash(data);
        } catch (e) {
            console.error("Atualização forçada falhou:", e);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        void loadDashboard();
        const t = setInterval(() => void loadDashboard(), 15000);
        return () => clearInterval(t);
    }, [loadDashboard]);

    const loadPassagens = useCallback(async () => {
        setPassagensLoading(true);
        try {
            const today = new Date().toISOString().split("T")[0];
            const res = await apiGet<{ data: Passagem[]; meta: { total: number } }>(
                `/instituicao/${codigoInstituicao}/passagem?limit=50&dataInicio=${today}`,
            );
            setRecentes((res.data || []).slice(0, 10));
        } catch {
            // ignore
        } finally {
            setPassagensLoading(false);
        }
    }, [codigoInstituicao]);

    useEffect(() => {
        void loadPassagens();
        const interval = setInterval(loadPassagens, 10000);
        return () => clearInterval(interval);
    }, [loadPassagens]);

    const inst = dash?.instituicao;

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
                                formatter: () => String(dash?.counts.rotinas.total ?? 0),
                            },
                        },
                    },
                },
            },
            legend: { position: "bottom" },
        }),
        [dash?.counts.rotinas.total],
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
        if (!dash) return [{ name: "Jobs", data: [0, 0, 0, 0, 0] }];
        return [
            {
                name: "Jobs",
                data: [
                    (dash.queue.waiting || 0) + (dash.queue.prioritized || 0),
                    dash.queue.active || 0,
                    dash.queue.failed || 0,
                    dash.queue.delayed || 0,
                    dash.queue.completed || 0,
                ],
            },
        ];
    }, [dash]);

    const heatmapSeries = useMemo(() => {
        if (!dash) return [];
        const i = dash.instituicao;
        return [
            {
                name: i.nome,
                data: JANELAS_CURTAS.map((j) => ({
                    x: j,
                    y: i.execucoesPorJanelaCurta[j],
                })),
            },
        ];
    }, [dash]);

    const heatmapOptions: ApexOptions = useMemo(
        () => ({
            chart: {
                type: "heatmap",
                fontFamily: "Outfit, sans-serif",
                toolbar: { show: false },
            },
            dataLabels: { enabled: false },
            colors: ["#6366f1"],
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
                text: "Mapa de Calor: frequência por janela (esta instituição)",
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

    const duracaoMs = inst?.tempoProcessamentoMsPorJanela[duracaoJanela] ?? 0;

    const duracaoBarOptions: ApexOptions = useMemo(
        () => ({
            chart: { type: "bar", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
            plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
            xaxis: { categories: inst ? [inst.nome.slice(0, 28)] : [] },
            dataLabels: { formatter: (v: number) => formatDurationMs(v as number) },
            tooltip: { y: { formatter: (v: number) => formatDurationMs(v) } },
            colors: ["#6366f1"],
        }),
        [inst],
    );

    const serieSelecionada = useMemo(() => {
        if (!dash) return null;
        return (
            dash.serieExecucoesInstituicao.find((s) => s.periodo === seriePeriodo) ?? null
        );
    }, [dash, seriePeriodo]);

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
        if (!inst) return null;
        const st = inst.statusPorJanela[pieJanela] || emptyStatusContagem();
        return {
            chart: { type: "donut", fontFamily: "Outfit, sans-serif" },
            labels: STATUS_ORDER.map((k) => STATUS_LABEL[k]),
            colors: ["#22c55e", "#ef4444", "#f97316", "#94a3b8", "#3b82f6"],
            legend: { position: "bottom" },
            plotOptions: {
                pie: {
                    donut: {
                        size: "70%",
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
    }, [inst, pieJanela]);

    const pieSeries = useMemo(() => {
        if (!inst) return [];
        const st = inst.statusPorJanela[pieJanela] || emptyStatusContagem();
        return STATUS_ORDER.map((k) => st[k] || 0);
    }, [inst, pieJanela]);

    const pieTotal = useMemo(() => pieSeries.reduce((a, b) => a + b, 0), [pieSeries]);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <RefreshIcon className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!dash || !inst) {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                Não foi possível carregar o monitor desta instituição. Verifique se o snapshot global
                está atualizado.
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white/90">
                        Dashboard — {inst.nome}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Dados do monitor (Redis) filtrados por instituição. Snapshot global +
                        complemento em cache por instituição.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <span className="text-xs text-gray-400">
                        Gerado em: {new Date(dash.generatedAt).toLocaleString()}
                        {dash.refreshDurationMs != null && (
                            <span className="ml-2">({dash.refreshDurationMs} ms)</span>
                        )}
                    </span>
                    {(isSuperRoot || isAdmin) && (
                        <button
                            type="button"
                            disabled={refreshing}
                            onClick={() => void handleForceRefresh()}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                            Atualizar snapshot global
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                    title="Fila (Aguardando)"
                    value={dash.queue.waiting || 0}
                    icon={<ListIcon className="text-blue-500" />}
                    subtitle="Fila Rabbit desta instituição"
                />
                <StatCard
                    title="Processando (snapshot)"
                    value={dash.queue.totalActive || 0}
                    icon={<BoltIcon className="text-amber-500" />}
                    subtitle={`${dash.queue.active || 0} em execução (semáforo)`}
                />
                <StatCard
                    title="Pessoas"
                    value={dash.counts.pessoas}
                    icon={<GroupIcon className="text-purple-500" />}
                    subtitle="Esta instituição"
                />
                <StatCard
                    title="Matrículas"
                    value={dash.counts.matriculas}
                    icon={<TaskIcon className="text-green-500" />}
                    subtitle="Esta instituição"
                />
                <StatCard
                    title="Execuções hoje / total"
                    value={dash.counts.execucoes.hoje}
                    icon={<PieChartIcon className="text-emerald-500" />}
                    subtitle={`Total histórico: ${dash.counts.execucoes.total.toLocaleString()}`}
                />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-6 flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Detalhe da instituição
                    </h3>
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

                {pieOptions ? (
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <div>
                            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                <PieChartIcon className="h-6 w-6" />
                                Distribuição por status
                            </h4>
                            {pieTotal > 0 ? (
                                <ReactApexChart
                                    options={pieOptions}
                                    series={pieSeries}
                                    type="donut"
                                    height={STATUS_PIE_CHART_HEIGHT}
                                />
                            ) : (
                                <div
                                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 dark:border-gray-800"
                                    style={{ minHeight: STATUS_PIE_CHART_HEIGHT }}
                                >
                                    <PieChartIcon className="mb-2 h-10 w-10 text-gray-300 dark:text-gray-700" />
                                    <p className="text-sm text-gray-400">Sem dados no período</p>
                                </div>
                            )}
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-white/50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                            <InstituicaoRabbitPanel rabbit={dash.rabbit} />
                        </div>
                    </div>
                ) : null}

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
                        {(inst.topRotinasPorJanelaCurta[topCurtaTab] ?? []).map((t) => (
                            <li key={t.rotinaCodigo} className="flex justify-between gap-2">
                                <span className="truncate">{t.nome}</span>
                                <span className="tabular-nums text-gray-500">{t.execucoes}</span>
                            </li>
                        ))}
                        {(inst.topRotinasPorJanelaCurta[topCurtaTab] ?? []).length === 0 && (
                            <li className="text-gray-400">Sem dados</li>
                        )}
                    </ul>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Execuções nesta instituição (cumulativo)
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
                        <Row label="Clientes (escopo)" value={dash.counts.clientes} />
                        <Row label="Instituições (escopo)" value={dash.counts.instituicoes} />
                        <Row label="Equipamentos" value={dash.counts.equipamentos} />
                        <Row label="Execuções hoje" value={dash.counts.execucoes.hoje} accent />
                        <Row label="Execuções total" value={dash.counts.execucoes.total} />
                    </div>
                </div>

                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                        Tipos de rotinas
                    </h3>
                    <div className="flex justify-center">
                        <ReactApexChart
                            options={routineOptions}
                            series={[dash.counts.rotinas.webhooks, dash.counts.rotinas.schedules]}
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
                        Ativos = semáforo Redis; sucesso/falha = histórico no banco (esta instituição).
                    </p>
                    <ReactApexChart options={queueOptions} series={queueSeries} type="bar" height={260} />
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                    Mapa de Calor — esta instituição
                </h3>
                <ReactApexChart
                    className="w-full"
                    options={heatmapOptions}
                    series={heatmapSeries}
                    type="heatmap"
                    height={280}
                    width="100%"
                />

                <h3 className="mb-4 mt-8 text-lg font-semibold text-gray-800 dark:text-white/90">
                    Execuções por janela (esta instituição)
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
                            <tr className="border-b border-gray-100 dark:border-gray-800/80">
                                <td className="py-2 pr-4 font-medium text-gray-800 dark:text-white/90">
                                    {inst.nome}
                                </td>
                                {JANELAS_CURTAS.map((j) => (
                                    <td key={j} className="py-2 px-2 text-right tabular-nums">
                                        {inst.execucoesPorJanelaCurta[j].toLocaleString()}
                                    </td>
                                ))}
                                <td className="py-2 pl-2 text-right tabular-nums">
                                    {inst.pessoas.toLocaleString()}
                                </td>
                                <td className="py-2 pl-2 text-right tabular-nums">
                                    {inst.matriculas.toLocaleString()}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Tempo total de processamento (soma duração rotinas)
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
                {duracaoMs > 0 ? (
                    <ReactApexChart
                        options={duracaoBarOptions}
                        series={[{ name: "ms", data: [duracaoMs] }]}
                        type="bar"
                        height={280}
                    />
                ) : (
                    <p className="text-sm text-gray-500">Sem durações registradas no período.</p>
                )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Volume por status (esta instituição)
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
                                {(dash.rankingsGlobaisPorStatus[rankJanela]?.[sk] ?? []).map(
                                    (r, idx) => (
                                        <li key={r.codigo} className="flex justify-between gap-2">
                                            <span className="text-gray-500">
                                                {idx + 1}. {r.nome.slice(0, 36)}
                                            </span>
                                            <span className="tabular-nums font-medium">
                                                {r.count.toLocaleString()}
                                            </span>
                                        </li>
                                    ),
                                )}
                                {(dash.rankingsGlobaisPorStatus[rankJanela]?.[sk] ?? []).length ===
                                    0 && <li className="text-gray-400">Nenhuma</li>}
                            </ol>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Últimas Passagens
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Atualização automática a cada 10s — {instituicao?.INSNome || `Instituição ${codigoInstituicao}`}
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    Pessoa
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    Ação
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    Equipamento
                                </th>
                                <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    Hora
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {passagensLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                                        Carregando...
                                    </td>
                                </tr>
                            ) : recentes.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-8 text-center text-gray-400">
                                        Nenhuma passagem registrada hoje.
                                    </td>
                                </tr>
                            ) : (
                                recentes.map((p) => (
                                    <tr
                                        key={p.REGCodigo}
                                        className="border-b border-gray-50 transition-colors hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-white/[0.02]"
                                    >
                                        <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">
                                            {p.pessoa?.PESNome || "—"}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                    p.REGAcao === "ENTRADA"
                                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                                }`}
                                            >
                                                {p.REGAcao === "ENTRADA" ? "↗ Entrada" : "↙ Saída"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            {p.equipamento?.EQPDescricao || "—"}
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(p.REGDataHora).toLocaleTimeString("pt-BR")}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <BoxCubeIcon className="h-6 w-6" />
                Snapshot v{dash.version} — Redis: monitor:global:snapshot:v1 + monitor:instituicao:
                {codigoInstituicao}:dashboard:v1
            </div>
        </div>
    );
}

function InstituicaoRabbitPanel({
    rabbit,
}: {
    rabbit: MonitorInstituicaoDashboard["rabbit"];
}) {
    const [history, setHistory] = useState<{ publish: number[]; deliver: number[]; timestamps: string[] }>(
        { publish: [], deliver: [], timestamps: [] },
    );

    useEffect(() => {
        setHistory((prev) => ({
            publish: [...prev.publish, rabbit.publish_rate].slice(-20),
            deliver: [...prev.deliver, rabbit.deliver_rate].slice(-20),
            timestamps: [...prev.timestamps, new Date().toLocaleTimeString()].slice(-20),
        }));
    }, [rabbit.publish_rate, rabbit.deliver_rate, rabbit.timestamp]);

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

    const totalMsg = rabbit.messages_ready + rabbit.messages_unacknowledged;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                    <BoltIcon className="h-6 w-6 text-amber-500" />
                    RabbitMQ — fila da instituição
                </h4>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniCard title="Total MSG" subtitle={rabbit.queue_name} value={totalMsg} />
                <MiniCard title="Em Processamento" value={rabbit.messages_unacknowledged} />
                <MiniCard title="Publish" value={`${rabbit.publish_rate?.toFixed(1) ?? 0}/s`} />
                <MiniCard title="Deliver" value={`${rabbit.deliver_rate?.toFixed(1) ?? 0}/s`} />
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-2 dark:border-gray-800 dark:bg-black/20">
                <ReactApexChart options={chartOptions} series={chartSeries} type="area" height={180} />
            </div>
        </div>
    );
}

function MiniCard({
    title,
    subtitle,
    value,
}: {
    title: string;
    subtitle?: string;
    value: string | number;
}) {
    return (
        <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {title}
            </p>
            {subtitle ? (
                <p
                    className="mt-0.5 truncate text-[9px] font-mono text-gray-400 dark:text-gray-500"
                    title={subtitle}
                >
                    {subtitle}
                </p>
            ) : null}
            <p className="mt-1 text-lg font-bold text-gray-800 dark:text-white">{value}</p>
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
