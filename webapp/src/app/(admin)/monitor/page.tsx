"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { MonitorService, MonitorStats } from "@/services/monitor.service";
import {
    GroupIcon,
    BoxCubeIcon,
    PieChartIcon,
    TaskIcon,
    ListIcon,
    RefreshIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    BoltIcon,
} from "@/icons";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function MonitorPage() {
    const { isSuperRoot, isAdmin, loading: authLoading } = useAuth();
    const router = useRouter();
    const [stats, setStats] = useState<MonitorStats | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStats = useCallback(async () => {
        try {
            const data = await MonitorService.getStats();
            setStats(data);
        } catch (error) {
            console.error("Error loading monitor stats:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && !isSuperRoot && !isAdmin) {
            router.push("/");
            return;
        }
        loadStats();
        const interval = setInterval(loadStats, 10000);
        return () => clearInterval(interval);
    }, [isSuperRoot, isAdmin, authLoading, router, loadStats]);

    if (authLoading || loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <RefreshIcon className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!stats) return null;

    const routineOptions: ApexOptions = {
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
                            formatter: () => String(stats.counts.rotinas.total),
                        },
                    },
                },
            },
        },
        legend: { position: "bottom" },
    };

    const queueOptions: ApexOptions = {
        colors: ["#3b82f6", "#ef4444", "#10b981", "#6366f1"],
        chart: { type: "bar", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
        xaxis: {
            categories: ["Waiting", "Failed", "Completed", "Delayed"],
        },
        plotOptions: {
            bar: { borderRadius: 4, columnWidth: "50%" },
        },
    };

    const queueSeries = [
        {
            name: "Jobs",
            data: [
                stats.queue.waiting,
                stats.queue.failed,
                stats.queue.completed,
                stats.queue.delayed,
            ],
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white/90">
                        Monitor Global
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Visão geral do sistema e processamento em tempo real
                    </p>
                </div>
                <div className="text-xs text-gray-400">
                    Última atualização: {new Date(stats.timestamp).toLocaleTimeString()}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Processando Agora"
                    value={stats.queue.running}
                    icon={<BoltIcon className="text-amber-500" />}
                    subtitle="Execuções manuais/background"
                />
                <StatCard
                    title="Fila (Aguardando)"
                    value={stats.queue.waiting}
                    icon={<ListIcon className="text-blue-500" />}
                    subtitle="Jobs pendentes no Redis"
                />
                <StatCard
                    title="Total de Pessoas"
                    value={stats.counts.pessoas}
                    icon={<GroupIcon className="text-purple-500" />}
                    subtitle="Em todas as instituições"
                />
                <StatCard
                    title="Matrículas"
                    value={stats.counts.matriculas}
                    icon={<TaskIcon className="text-green-500" />}
                    subtitle="Total na plataforma"
                />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Outras Contagens */}
                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                        Infraestrutura
                    </h3>
                    <div className="space-y-4">
                        <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                            <span className="text-gray-500">Clientes</span>
                            <span className="font-bold text-gray-800 dark:text-white">{stats.counts.clientes}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                            <span className="text-gray-500">Instituições</span>
                            <span className="font-bold text-gray-800 dark:text-white">{stats.counts.instituicoes}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                            <span className="text-gray-500">Equipamentos</span>
                            <span className="font-bold text-gray-800 dark:text-white">{stats.counts.equipamentos}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-100 pb-2 dark:border-gray-800">
                            <span className="text-gray-500">Execuções Hoje</span>
                            <span className="font-bold text-green-600 dark:text-green-400">{stats.counts.execucoes.hoje}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Total Histórico</span>
                            <span className="font-bold text-gray-800 dark:text-white">{stats.counts.execucoes.total}</span>
                        </div>
                    </div>
                </div>

                {/* Rotinas Chart */}
                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                        Tipos de Rotinas
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

                {/* Queue Status Chart */}
                <div className="col-span-1 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                    <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
                        Status da Fila (BullMQ)
                    </h3>
                    <ReactApexChart
                        options={queueOptions}
                        series={queueSeries}
                        type="bar"
                        height={250}
                    />
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, subtitle }: {
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
