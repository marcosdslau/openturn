"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/context/ToastContext";
import Button from "@/components/ui/button/Button";
import { ChevronLeftIcon } from "@/icons";
import AcessoAreasTab from "./AcessoAreasTab";
import AcessoDepartamentosTab from "./AcessoDepartamentosTab";
import AcessoHorariosTab from "./AcessoHorariosTab";

interface Equipamento {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
    EQPEnderecoIp: string | null;
    EQPAtivo: boolean;
    EQPUsaAddon: boolean;
    EQPConfig?: any;
    EQPDataUltimaBusca?: number;
}

type ConfigTabId = 'geral' | 'areas' | 'horarios' | 'departamentos' | 'liberacoes_agendadas';

export default function ControlIDConfigPage() {
    const { loading: authLoading } = useAuth();
    const { codigoInstituicao } = useTenant();
    const { can } = usePermissions();
    const params = useParams();
    const router = useRouter();
    const { showToast } = useToast();
    const mayMutateEquip = can("equipamento", "update");

    // ID from URL might be string
    const codigoEquipamento = params.codigoEquipamento;

    const [equipment, setEquipment] = useState<Equipamento | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<ConfigTabId>('geral');
    const [connectorOnline, setConnectorOnline] = useState(false);
    const [creatingSession, setCreatingSession] = useState(false);
    const [remoteTargetIp, setRemoteTargetIp] = useState<string>("");

    // General Form State
    const [form, setForm] = useState<any>({});
    const [usaAddon, setUsaAddon] = useState(false);
    const [dataUltimaBusca, setDataUltimaBusca] = useState<number>(1750381200);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [configureTypeLoading, setConfigureTypeLoading] = useState<
        null | "GERAL" | "BOX" | "WEBHOOK"
    >(null);
    const [confirmDeleteUsersOpen, setConfirmDeleteUsersOpen] = useState(false);
    const [deletingUsers, setDeletingUsers] = useState(false);

    const loadSessions = useCallback(async () => {
        if (!codigoEquipamento) return;
        setLoadingSessions(true);
        try {
            const res = await apiGet<any[]>(`/instituicao/${codigoInstituicao}/equipamento/${codigoEquipamento}/remoto/sessoes`);
            setSessions(res || []);
        } catch { } finally { setLoadingSessions(false); }
    }, [codigoInstituicao, codigoEquipamento]);

    const loadEquipment = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch specific equipment
            // We might need a specific endpoint or just list and find (if GET /id not available)
            // Assuming GET /instituicao/:id/equipamento/:eqpId exists or we can use the list
            // Let's try to fetch list and find for now if specific endpoint is not guaranteed
            // Or better, fetch the list and filter.

            // Wait, apiGet to /instituicao/{id}/equipamento returns list.
            // Check if there is a get by ID or filter.
            // Let's assume we can fetch by ID for now, or fallback to list.
            // Actually previous code used PATCH to /equipamento/:id so GET /equipamento/:id should work or /equipamento?EQPCodigo=...

            // Let's try fetching the single item if the API supports it.
            // Based on REST patterns usually GET /resource/:id
            // If not, we might need to fix the API or use list.
            // Let's assume GET /instituicao/.../equipamento/:id works.

            // Wait, looking at page.tsx, it uses `/instituicao/${codigoInstituicao}/equipamento/${editing.EQPCodigo}` for PATCH.
            // So GET should be supported there too ideally.
            // If not, I'll have to debug.

            // Checking the previous file... it only did GET list.
            // But usually NestJS CRUD provides GET one.

            const res = await apiGet<Equipamento>(`/instituicao/${codigoInstituicao}/equipamento/${codigoEquipamento}`);
            setEquipment(res);
            const cfg = res.EQPConfig || {};
            setForm({
                ...cfg,
                entry_side:
                    cfg.entry_side ??
                    (cfg.entry_direction === 'counter_clockwise' ? 'left' : 'right'),
                entry_direction_applied_by_equipment:
                    cfg.entry_direction_applied_by_equipment ?? false,
            });
            setUsaAddon(res.EQPUsaAddon || false);
            setDataUltimaBusca(res.EQPDataUltimaBusca ?? 1750381200);
            setRemoteTargetIp(res.EQPEnderecoIp || "");
            loadSessions();

            // Check connector status
            if (res.EQPUsaAddon) {
                try {
                    const connStatus = await apiGet<{ status: string }>(`/instituicao/${codigoInstituicao}/connector/status`);
                    setConnectorOnline(connStatus?.status === 'ONLINE');
                } catch { setConnectorOnline(false); }
            }

        } catch (error: any) {
            showToast("error", "Erro ao carregar", "Não foi possível carregar os dados do equipamento.");
            router.push(`/instituicao/${codigoInstituicao}/equipamentos`);
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, codigoEquipamento, router, showToast, loadSessions]);

    useEffect(() => {
        if (authLoading) return;
        if (!mayMutateEquip) {
            showToast(
                "info",
                "Acesso restrito",
                "A configuração e comandos de hardware exigem permissão de alteração em equipamentos.",
            );
            router.replace(`/instituicao/${codigoInstituicao}/equipamentos`);
            return;
        }
        if (codigoEquipamento) {
            loadEquipment();
        }
    }, [authLoading, mayMutateEquip, codigoEquipamento, codigoInstituicao, router, showToast, loadEquipment]);

    const tabs = useMemo(() => {
        const base: { id: ConfigTabId; name: string }[] = [
            { id: 'geral', name: 'Geral' },
            { id: 'areas', name: 'Áreas' },
            { id: 'horarios', name: 'Horários' },
            { id: 'departamentos', name: 'Departamentos' },
        ];
        if (equipment?.EQPMarca === 'ControlID') {
            base.push({ id: 'liberacoes_agendadas', name: 'Liberações Agendadas' });
        }
        return base;
    }, [equipment?.EQPMarca]);

    useEffect(() => {
        if (activeTab === 'liberacoes_agendadas' && equipment?.EQPMarca !== 'ControlID') {
            setActiveTab('geral');
        }
    }, [activeTab, equipment?.EQPMarca]);

    const handleConfigureEquipment = async (type: "GERAL" | "BOX" | "WEBHOOK") => {
        if (!equipment) return;
        setConfigureTypeLoading(type);
        try {
            const res = await apiPost<{
                applied?: boolean;
                type?: string;
                reason?: string;
            }>(
                `/instituicao/${codigoInstituicao}/hardware/${equipment.EQPCodigo}/configure-equipment`,
                { type },
            );
            if (res && typeof res === "object" && res.applied === false) {
                showToast(
                    "info",
                    "Configuração",
                    res.reason || "Nenhuma alteração aplicada no equipamento.",
                );
            } else {
                showToast("success", "Configuração", "Operação concluída com sucesso.");
            }
        } catch (error: any) {
            const msg =
                error?.message ||
                error?.response?.data?.message ||
                "Não foi possível aplicar a configuração.";
            showToast("error", "Erro", String(msg));
        } finally {
            setConfigureTypeLoading(null);
        }
    };

    const handleConfirmDeleteAllUsers = async () => {
        if (!equipment) return;
        setConfirmDeleteUsersOpen(false);
        setDeletingUsers(true);
        try {
            await apiPost<{ ok?: boolean }>(
                `/instituicao/${codigoInstituicao}/hardware/${equipment.EQPCodigo}/delete-all-users`,
                {},
            );
            showToast(
                "success",
                "Operação enviada",
                "Solicitação de exclusão de todos os usuários no equipamento foi processada.",
            );
        } catch (error: any) {
            const msg =
                error?.message ||
                error?.response?.data?.message ||
                "Não foi possível executar a exclusão.";
            showToast("error", "Erro", String(msg));
        } finally {
            setDeletingUsers(false);
        }
    };

    const handleSaveGeneral = async () => {
        if (!equipment) return;
        setSaving(true);
        try {
            // We only update the config payload
            await apiPatch(`/instituicao/${codigoInstituicao}/equipamento/${equipment.EQPCodigo}`, {
                EQPConfig: form,
                EQPUsaAddon: usaAddon,
                EQPDataUltimaBusca: dataUltimaBusca,
            });
            showToast("success", "Configuração salva", "As configurações foram atualizadas com sucesso.");
            loadEquipment(); // Refresh to update button visibility
        } catch (error: any) {
            showToast("error", "Erro ao salvar", "Ocorreu um erro ao salvar as configurações.");
        } finally {
            setSaving(false);
        }
    };

    const handleCloseSession = async (sessionId: string) => {
        try {
            await apiDelete(`/instituicao/${codigoInstituicao}/equipamento/${codigoEquipamento}/remoto/sessoes/${sessionId}`);
            showToast("success", "Sessão encerrada", "A sessão remota foi encerrada com sucesso.");
            loadSessions();
        } catch (error: any) {
            showToast("error", "Erro", "Não foi possível encerrar a sessão.");
        }
    };

    if (authLoading || !mayMutateEquip) {
        return <div className="p-8 text-center text-gray-500">Carregando...</div>;
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Carregando configurações do equipamento...</div>;
    }

    if (!equipment) {
        return <div className="p-8 text-center text-red-500">Equipamento não encontrado.</div>;
    }

    return (
        <div className="space-y-6 relative">
            {deletingUsers && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-[1px]"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white px-10 py-8 shadow-2xl dark:border-gray-600 dark:bg-gray-800">
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                        <p className="text-sm font-medium text-gray-800 dark:text-white">
                            Excluindo usuários do equipamento...
                        </p>
                        <p className="max-w-xs text-center text-xs text-gray-500 dark:text-gray-400">
                            Aguarde até a operação ser concluída.
                        </p>
                    </div>
                </div>
            )}
            {confirmDeleteUsersOpen && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="confirm-delete-users-title"
                        className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
                    >
                        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                            <h4
                                id="confirm-delete-users-title"
                                className="text-lg font-semibold text-gray-900 dark:text-white"
                            >
                                Confirmar exclusão
                            </h4>
                            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
                                Você tem certeza que deseja excluir <strong>todos os usuários</strong> cadastrados
                                neste equipamento? Esta operação é <strong>irreversível</strong>.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 px-5 py-4">
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setConfirmDeleteUsersOpen(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                className="!bg-red-600 !text-white hover:!bg-red-700 border-transparent"
                                onClick={() => void handleConfirmDeleteAllUsers()}
                            >
                                Confirmar exclusão
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex items-center gap-4 flex-1">
                <Button variant="outline" size="sm" onClick={() => router.back()}>
                    <ChevronLeftIcon className="w-5 h-5" />
                </Button>
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                        Configuração: {equipment.EQPDescricao}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {equipment.EQPMarca} - {equipment.EQPModelo || 'Modelo N/A'} ({equipment.EQPEnderecoIp})
                    </p>
                </div>
            </div>
            {equipment.EQPUsaAddon && connectorOnline && (
                <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 ml-1">IP Alvo para Gerenciamento</label>
                        <select
                            value={remoteTargetIp}
                            onChange={(e) => setRemoteTargetIp(e.target.value)}
                            className="text-xs bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-700 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none min-w-[150px]"
                        >
                            <option value={equipment.EQPEnderecoIp || ""}>Principal ({equipment.EQPEnderecoIp || "N/A"})</option>
                            {equipment.EQPConfig?.ip_entry && <option value={equipment.EQPConfig.ip_entry}>Entrada Face ({equipment.EQPConfig.ip_entry})</option>}
                            {equipment.EQPConfig?.ip_exit && <option value={equipment.EQPConfig.ip_exit}>Saída Face ({equipment.EQPConfig.ip_exit})</option>}
                        </select>
                    </div>
                    <Button
                        size="sm"
                        disabled={creatingSession}
                        className="mt-4"
                        onClick={async () => {
                            setCreatingSession(true);
                            try {
                                const session = await apiPost(
                                    `/instituicao/${codigoInstituicao}/equipamento/${equipment.EQPCodigo}/remoto/sessoes`,
                                    { targetIp: remoteTargetIp },
                                );
                                window.open(session.url, '_blank');
                            } catch (err: any) {
                                showToast('error', 'Erro', err.message || 'Falha ao criar sessão remota');
                            } finally {
                                setCreatingSession(false);
                            }
                        }}
                    >
                        {creatingSession ? 'Abrindo...' : '🖥️ Gerenciar Remotamente'}
                    </Button>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium
                                ${activeTab === tab.id
                                    ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}
                            `}
                        >
                            {tab.name}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            <div className="mt-6">
                {activeTab === 'geral' && (
                    <div className="max-w-2xl space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Configurações Gerais</h3>
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer" htmlFor="usa-addon">Usa Addon</label>
                                <input
                                    id="usa-addon"
                                    type="checkbox"
                                    checked={usaAddon}
                                    onChange={(e) => setUsaAddon(e.target.checked)}
                                    className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500 dark:bg-gray-700 dark:border-gray-600"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Configurações</p>
                            <div className="flex flex-wrap gap-2 items-center">
                                {(
                                    [
                                        { type: "GERAL" as const, label: "Geral" },
                                        { type: "BOX" as const, label: "Box" },
                                        { type: "WEBHOOK" as const, label: "Webhooks" },
                                    ] as const
                                ).map(({ type, label }) => (
                                    <Button
                                        key={type}
                                        variant="outline"
                                        size="sm"
                                        disabled={configureTypeLoading !== null || deletingUsers}
                                        onClick={() => handleConfigureEquipment(type)}
                                    >
                                        {configureTypeLoading === type ? "Aplicando..." : label}
                                    </Button>
                                ))}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={configureTypeLoading !== null || deletingUsers}
                                    className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                                    onClick={() => setConfirmDeleteUsersOpen(true)}
                                >
                                    Excluir usuários
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Giro</label>
                                <select
                                    value={form.rotation_type || 'both_controlled'}
                                    onChange={(e) => setForm({ ...form, rotation_type: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                >
                                    <option value="both_controlled">Ambas Controladas</option>
                                    <option value="entry_free_exit_controlled">Entrada Liberada / Saída Controlada</option>
                                    <option value="entry_controlled_exit_free">Entrada Controlada / Saída Liberada</option>
                                    <option value="both_free">Ambas Liberadas</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sentido de entrada (catraca)</label>
                                <select
                                    value={form.entry_side === 'left' ? 'left' : 'right'}
                                    onChange={(e) => {
                                        const side = e.target.value as 'left' | 'right';
                                        setForm({
                                            ...form,
                                            entry_side: side,
                                            entry_direction:
                                                side === 'left' ? 'counter_clockwise' : 'clockwise',
                                        });
                                    }}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                >
                                    <option value="right">Direita</option>
                                    <option value="left">Esquerda</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Interpretação do giro (Monitor)</label>
                                <select
                                    value={form.entry_direction_applied_by_equipment ? 'equipment' : 'native'}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            entry_direction_applied_by_equipment:
                                                e.target.value === 'equipment',
                                        })
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                >
                                    <option value="native">Nativo da catraca</option>
                                    <option value="equipment">Pela instalação / equipamento</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Anti-Dupla Entrada</label>
                                <select
                                    value={form.anti_double_entry || 'inactive'}
                                    onChange={(e) => setForm({ ...form, anti_double_entry: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                >
                                    <option value="active">Ativo</option>
                                    <option value="inactive">Inativo</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Modo de Operação</label>
                                <select
                                    value={form.mode || 'standalone'}
                                    onChange={(e) => setForm({ ...form, mode: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                >
                                    <option value="standalone">Standard (Standalone)</option>
                                    <option value="pro">Pro</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                        </div>

                        {(equipment.EQPModelo === 'iDBlock Facial' || equipment.EQPModelo === 'iDBlock Next') && (
                            <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Configuração {equipment.EQPModelo} (3 IPs)</h4>
                                <fieldset className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3">
                                    <legend className="text-sm font-semibold text-gray-800 dark:text-gray-200 px-1">Entrada (entry)</legend>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IP iDFace Entrada</label>
                                            <input
                                                placeholder="Ex: 192.168.1.101"
                                                value={form.ip_entry || ''}
                                                onChange={(e) => setForm({ ...form, ip_entry: e.target.value })}
                                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Device ID Monitor (entrada)</label>
                                            <input
                                                placeholder="device_id do Monitor — leitor entrada"
                                                value={form.deviceId_entry || ''}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
                                                        deviceId_entry: e.target.value || undefined,
                                                    })
                                                }
                                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                            />
                                        </div>
                                    </div>
                                </fieldset>
                                <fieldset className="rounded-lg border border-gray-200 dark:border-gray-600 p-4 space-y-3">
                                    <legend className="text-sm font-semibold text-gray-800 dark:text-gray-200 px-1">Saída (exit)</legend>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IP iDFace Saída</label>
                                            <input
                                                placeholder="Ex: 192.168.1.102"
                                                value={form.ip_exit || ''}
                                                onChange={(e) => setForm({ ...form, ip_exit: e.target.value })}
                                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Device ID Monitor (saída)</label>
                                            <input
                                                placeholder="device_id do Monitor — leitor saída"
                                                value={form.deviceId_exit || ''}
                                                onChange={(e) =>
                                                    setForm({
                                                        ...form,
                                                        deviceId_exit: e.target.value || undefined,
                                                    })
                                                }
                                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                            />
                                        </div>
                                    </div>
                                </fieldset>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Data Última Busca <span className="font-normal text-gray-500">(Unix Timestamp)</span>
                            </label>
                            <input
                                type="number"
                                value={dataUltimaBusca}
                                onChange={(e) => setDataUltimaBusca(Number(e.target.value))}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Referência de tempo para a última busca de dados neste equipamento.{' '}
                                {dataUltimaBusca > 0 && (
                                    <span className="font-medium">
                                        {new Date(dataUltimaBusca * 1000).toLocaleString('pt-BR', {
                                            day: '2-digit', month: '2-digit', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                                        })}
                                    </span>
                                )}
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
                            <Button disabled={saving} onClick={handleSaveGeneral}>
                                {saving ? "Salvando..." : "Salvar Configurações"}
                            </Button>
                        </div>

                        {/* Active Sessions Section */}
                        {usaAddon && (
                            <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700 space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Sessões Remotas Ativas</h3>
                                    <Button size="sm" variant="outline" onClick={loadSessions} disabled={loadingSessions}>
                                        {loadingSessions ? "Atualizando..." : "🔄 Atualizar"}
                                    </Button>
                                </div>

                                {sessions.length === 0 ? (
                                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                                        <p className="text-sm text-gray-500">Nenhuma sessão remota ativa no momento.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Início</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expira</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                {sessions.map((s) => (
                                                    <tr key={s.RMTSessionId}>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                                            <div>{s.usuario?.USRNome}</div>
                                                            <div className="text-xs text-gray-500">{s.usuario?.USREmail}</div>
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                            {new Date(s.createdAt).toLocaleTimeString()}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                            {new Date(s.RMTExpiraEm).toLocaleTimeString()}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                                                            <button
                                                                onClick={() => handleCloseSession(s.RMTSessionId)}
                                                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 font-medium"
                                                            >
                                                                Encerrar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'areas' && (
                    <AcessoAreasTab
                        institutionId={Number(codigoInstituicao)}
                        equipmentId={equipment.EQPCodigo}
                        podeEditar={mayMutateEquip}
                    />
                )}

                {activeTab === 'horarios' && (
                    <AcessoHorariosTab
                        institutionId={Number(codigoInstituicao)}
                        equipmentId={equipment.EQPCodigo}
                        podeEditar={mayMutateEquip}
                    />
                )}

                {activeTab === 'departamentos' && (
                    <AcessoDepartamentosTab
                        institutionId={Number(codigoInstituicao)}
                        equipmentId={equipment.EQPCodigo}
                        podeEditar={mayMutateEquip}
                    />
                )}

                {activeTab === 'liberacoes_agendadas' && equipment.EQPMarca === 'ControlID' && (
                    <ScheduledUnlocksTab
                        institutionId={Number(codigoInstituicao)}
                        equipmentId={Number(equipment.EQPCodigo)}
                        config={equipment.EQPConfig}
                        mainIp={equipment.EQPEnderecoIp}
                    />
                )}
            </div>
        </div>
    );
}

interface TabProps {
    institutionId: number;
    equipmentId: number;
    config: any;
    mainIp: string | null;
}

function normalizeHardwareIp(s: string | null | undefined): string {
    return (s ?? "").trim();
}

function useIpSelection(config: any, mainIp: string | null) {
    const ips = useMemo((): { label: string; ip: string; type: string }[] => {
        const main = normalizeHardwareIp(mainIp);
        const entry = normalizeHardwareIp(config?.ip_entry);
        const exit = normalizeHardwareIp(config?.ip_exit);
        // Evita "Principal" duplicado quando é o mesmo host da catraca dos faciais
        const mainIsRedundant = Boolean(main) && (main === entry || main === exit);

        const out: { label: string; ip: string; type: string }[] = [];
        if (main && !mainIsRedundant) {
            out.push({ label: "Principal", ip: main, type: "main" });
        }
        if (config?.ip_entry) {
            out.push({ label: "Entrada (Facial)", ip: entry, type: "entry" });
        }
        if (config?.ip_exit) {
            out.push({ label: "Saída (Facial)", ip: exit, type: "exit" });
        }
        return out;
    }, [mainIp, config?.ip_entry, config?.ip_exit]);

    const [selectedIp, setSelectedIp] = useState<string>(() => ips[0]?.ip ?? "");

    useEffect(() => {
        if (ips.length === 0) {
            setSelectedIp("");
            return;
        }
        setSelectedIp((cur) => {
            const valid = new Set(ips.map((i) => i.ip));
            if (cur && valid.has(cur)) return cur;
            return ips[0].ip;
        });
    }, [ips]);

    return { ips, selectedIp, setSelectedIp };
}

interface TimeSpan {
    id?: number;
    time_zone_id?: number;
    start: number; // in seconds
    end: number; // in seconds
    sun: number; mon: number; tue: number; wed: number;
    thu: number; fri: number; sat: number;
    hol1: number; hol2: number; hol3: number;
}
interface TimeZone {
    id: number;
    name: string;
    spans?: TimeSpan[];
}




interface ScheduledUnlock {
    id: number;
    name: string;
    message?: string;
    accessRuleId?: number;
    timeZoneNames: string[];
}

async function hardwareCommand(
    institutionId: number,
    equipmentId: number,
    command: string,
    params: Record<string, unknown>,
    targetIp: string,
): Promise<any> {
    return apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
        command,
        params,
        targetIp,
    });
}

function ScheduledUnlocksTab({ institutionId, equipmentId, config, mainIp }: TabProps) {
    const { showToast } = useToast();
    const { ips, selectedIp, setSelectedIp } = useIpSelection(config, mainIp);

    const [scheduledUnlocks, setScheduledUnlocks] = useState<ScheduledUnlock[]>([]);
    const [availableTimeZones, setAvailableTimeZones] = useState<TimeZone[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [formName, setFormName] = useState("");
    const [formMessage, setFormMessage] = useState("");
    const [selectedTimeZoneIds, setSelectedTimeZoneIds] = useState<number[]>([]);

    const loadScheduledUnlocks = useCallback(async () => {
        if (!selectedIp) return;
        setLoading(true);
        try {
            const [unlocksRes, rulesMapRes, ruleTzRes, tzRes] = await Promise.all([
                hardwareCommand(institutionId, equipmentId, 'load_objects', { object: 'scheduled_unlocks' }, selectedIp),
                hardwareCommand(institutionId, equipmentId, 'load_objects', { object: 'scheduled_unlock_access_rules' }, selectedIp),
                hardwareCommand(institutionId, equipmentId, 'load_objects', { object: 'access_rule_time_zones' }, selectedIp),
                hardwareCommand(institutionId, equipmentId, 'load_objects', { object: 'time_zones' }, selectedIp),
            ]);

            const unlocks: { id: number; name: string; message?: string }[] = unlocksRes.scheduled_unlocks || [];
            const rulesMap: { scheduled_unlock_id: number; access_rule_id: number }[] =
                rulesMapRes.scheduled_unlock_access_rules || [];
            const ruleTzLinks: { access_rule_id: number; time_zone_id: number }[] =
                ruleTzRes.access_rule_time_zones || [];
            const timeZones: TimeZone[] = tzRes.time_zones || [];

            setAvailableTimeZones(timeZones);

            const tzNameById = new Map(timeZones.map((tz) => [tz.id, tz.name]));
            const ruleByUnlockId = new Map(rulesMap.map((r) => [r.scheduled_unlock_id, r.access_rule_id]));
            const tzIdsByRuleId = new Map<number, number[]>();
            for (const link of ruleTzLinks) {
                const list = tzIdsByRuleId.get(link.access_rule_id) ?? [];
                list.push(link.time_zone_id);
                tzIdsByRuleId.set(link.access_rule_id, list);
            }

            const aggregated: ScheduledUnlock[] = unlocks.map((unlock) => {
                const accessRuleId = ruleByUnlockId.get(unlock.id);
                const tzIds = accessRuleId ? (tzIdsByRuleId.get(accessRuleId) ?? []) : [];
                const timeZoneNames = tzIds
                    .map((id) => tzNameById.get(id))
                    .filter((name): name is string => Boolean(name));
                return {
                    id: unlock.id,
                    name: unlock.name,
                    message: unlock.message,
                    accessRuleId,
                    timeZoneNames,
                };
            });

            setScheduledUnlocks(aggregated);
        } catch (e) {
            console.error(e);
            showToast("error", "Erro", "Falha ao carregar liberações agendadas.");
            setScheduledUnlocks([]);
        } finally {
            setLoading(false);
        }
    }, [institutionId, equipmentId, selectedIp, showToast]);

    useEffect(() => { loadScheduledUnlocks(); }, [loadScheduledUnlocks]);

    const openCreateModal = () => {
        setFormName("");
        setFormMessage("");
        setSelectedTimeZoneIds([]);
        setIsCreateModalOpen(true);
    };

    const toggleTimeZoneSelection = (tzId: number) => {
        setSelectedTimeZoneIds((prev) =>
            prev.includes(tzId) ? prev.filter((id) => id !== tzId) : [...prev, tzId],
        );
    };

    const rollbackCreate = async (
        created: { unlockId?: number; accessRuleId?: number },
    ) => {
        if (!selectedIp) return;
        try {
            if (created.accessRuleId) {
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'portal_access_rules',
                    where: { portal_access_rules: { access_rule_id: created.accessRuleId } },
                }, selectedIp);
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'access_rule_time_zones',
                    where: { access_rule_time_zones: { access_rule_id: created.accessRuleId } },
                }, selectedIp);
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'access_rules',
                    where: { access_rules: { id: created.accessRuleId } },
                }, selectedIp);
            }
            if (created.unlockId) {
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'scheduled_unlock_access_rules',
                    where: { scheduled_unlock_access_rules: { scheduled_unlock_id: created.unlockId } },
                }, selectedIp);
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'scheduled_unlocks',
                    where: { scheduled_unlocks: { id: created.unlockId } },
                }, selectedIp);
            }
        } catch {
            /* best-effort rollback */
        }
    };

    const handleCreate = async () => {
        if (!selectedIp || !formName.trim() || selectedTimeZoneIds.length === 0) return;

        setSaving(true);
        const created: { unlockId?: number; accessRuleId?: number } = {};

        try {
            const unlockRes = await hardwareCommand(institutionId, equipmentId, 'create_objects', {
                object: 'scheduled_unlocks',
                values: [{ name: formName.trim(), message: formMessage.trim() || undefined }],
            }, selectedIp);
            created.unlockId = unlockRes.ids?.[0];
            if (!created.unlockId) throw new Error('Falha ao criar liberação agendada');

            const ruleRes = await hardwareCommand(institutionId, equipmentId, 'create_objects', {
                object: 'access_rules',
                values: [{
                    name: `(access_rules automatically created for scheduled_unlock ${created.unlockId})`,
                    type: 1,
                    priority: 0,
                }],
            }, selectedIp);
            created.accessRuleId = ruleRes.ids?.[0];
            if (!created.accessRuleId) throw new Error('Falha ao criar regra de acesso');

            await hardwareCommand(institutionId, equipmentId, 'create_objects', {
                object: 'scheduled_unlock_access_rules',
                values: [{ scheduled_unlock_id: created.unlockId, access_rule_id: created.accessRuleId }],
            }, selectedIp);

            const portalRes = await hardwareCommand(institutionId, equipmentId, 'load_objects', {
                object: 'portals',
                limit: 1000,
            }, selectedIp);
            const portals: { id: number }[] = portalRes.portals || [];

            for (const portal of portals) {
                try {
                    await hardwareCommand(institutionId, equipmentId, 'create_objects', {
                        object: 'portal_access_rules',
                        values: [{ portal_id: portal.id, access_rule_id: created.accessRuleId }],
                    }, selectedIp);
                } catch {
                    /* ignore if already exists */
                }
            }

            await hardwareCommand(institutionId, equipmentId, 'create_objects', {
                object: 'access_rule_time_zones',
                values: selectedTimeZoneIds.map((timeZoneId) => ({
                    access_rule_id: created.accessRuleId,
                    time_zone_id: timeZoneId,
                })),
            }, selectedIp);

            showToast("success", "Sucesso", "Liberação agendada criada.");
            setIsCreateModalOpen(false);
            loadScheduledUnlocks();
        } catch (e) {
            console.error(e);
            await rollbackCreate(created);
            showToast("error", "Erro", "Falha ao criar liberação agendada.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (unlock: ScheduledUnlock) => {
        if (!selectedIp) return;
        if (!confirm(`Tem certeza que deseja excluir a liberação "${unlock.name}"?`)) return;

        setLoading(true);
        try {
            let accessRuleId = unlock.accessRuleId;
            if (!accessRuleId) {
                const rulesMapRes = await hardwareCommand(institutionId, equipmentId, 'load_objects', {
                    object: 'scheduled_unlock_access_rules',
                }, selectedIp);
                const rulesMap: { scheduled_unlock_id: number; access_rule_id: number }[] =
                    rulesMapRes.scheduled_unlock_access_rules || [];
                accessRuleId = rulesMap.find((r) => r.scheduled_unlock_id === unlock.id)?.access_rule_id;
            }

            if (accessRuleId) {
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'access_rule_time_zones',
                    where: { access_rule_time_zones: { access_rule_id: accessRuleId } },
                }, selectedIp);
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'portal_access_rules',
                    where: { portal_access_rules: { access_rule_id: accessRuleId } },
                }, selectedIp);
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'scheduled_unlock_access_rules',
                    where: { scheduled_unlock_access_rules: { scheduled_unlock_id: unlock.id } },
                }, selectedIp);
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'access_rules',
                    where: { access_rules: { id: accessRuleId } },
                }, selectedIp);
            } else {
                await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                    object: 'scheduled_unlock_access_rules',
                    where: { scheduled_unlock_access_rules: { scheduled_unlock_id: unlock.id } },
                }, selectedIp);
            }

            await hardwareCommand(institutionId, equipmentId, 'destroy_objects', {
                object: 'scheduled_unlocks',
                where: { scheduled_unlocks: { id: unlock.id } },
            }, selectedIp);

            showToast("success", "Sucesso", "Liberação agendada removida.");
            loadScheduledUnlocks();
        } catch (e) {
            console.error(e);
            showToast("error", "Erro", "Falha ao remover liberação agendada.");
        } finally {
            setLoading(false);
        }
    };

    const canSaveCreate = formName.trim().length > 0 && selectedTimeZoneIds.length > 0 && !saving;

    return (
        <div className="flex gap-6 relative">
            <div className="w-1/4 space-y-1">
                {ips.map((item) => (
                    <button
                        key={`${item.type}-${item.ip}`}
                        onClick={() => setSelectedIp(item.ip)}
                        className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors
                            ${selectedIp === item.ip
                                ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400'
                                : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                            }`}
                    >
                        {item.label}
                        <div className="text-xs font-normal opacity-70">{item.ip}</div>
                    </button>
                ))}
            </div>

            <div className="flex-1 space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Liberações Agendadas</h3>
                    <Button onClick={openCreateModal} disabled={loading}>Nova Liberação Agendada</Button>
                </div>

                {loading ? <p>Carregando...</p> : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mensagem</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horários vinculados</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {scheduledUnlocks.map((unlock) => (
                                    <tr key={unlock.id}>
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{unlock.id}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{unlock.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{unlock.message || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {unlock.timeZoneNames.length > 0
                                                ? unlock.timeZoneNames.join(", ")
                                                : <span className="italic">Nenhum horário</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDelete(unlock)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 border-gray-200 dark:border-gray-700"
                                            >
                                                Excluir
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {scheduledUnlocks.length === 0 && (
                            <p className="p-4 text-center text-gray-500 text-sm">Nenhuma liberação agendada cadastrada.</p>
                        )}
                    </div>
                )}
            </div>

            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Nova Liberação Agendada</h3>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                                <input
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                    value={formName}
                                    placeholder="Ex: Happy Hour"
                                    onChange={(e) => setFormName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensagem</label>
                                <input
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                    value={formMessage}
                                    placeholder="Mensagem exibida durante a liberação"
                                    onChange={(e) => setFormMessage(e.target.value)}
                                />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Horários de acesso
                                </p>
                                {availableTimeZones.length === 0 ? (
                                    <p className="text-sm text-amber-600 dark:text-amber-400">
                                        Cadastre horários na aba &quot;Horários&quot; antes de criar uma liberação.
                                    </p>
                                ) : (
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
                                        {availableTimeZones.map((tz) => (
                                            <label
                                                key={tz.id}
                                                className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTimeZoneIds.includes(tz.id)}
                                                    onChange={() => toggleTimeZoneSelection(tz.id)}
                                                    className="w-5 h-5 text-brand-600 rounded border-gray-300 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{tz.name}</span>
                                                    <span className="text-xs text-gray-500">ID: {tz.id}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-5 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
                            <Button
                                onClick={handleCreate}
                                className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md"
                                disabled={!canSaveCreate}
                            >
                                {saving ? 'Salvando...' : 'Salvar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
