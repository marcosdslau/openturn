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

interface Equipamento {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
    EQPEnderecoIp: string | null;
    EQPAtivo: boolean;
    EQPUsaAddon: boolean;
    EQPConfig?: any;
}

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
    const [activeTab, setActiveTab] = useState<'geral' | 'horarios' | 'departamentos'>('geral');
    const [connectorOnline, setConnectorOnline] = useState(false);
    const [creatingSession, setCreatingSession] = useState(false);
    const [remoteTargetIp, setRemoteTargetIp] = useState<string>("");

    // General Form State
    const [form, setForm] = useState<any>({});
    const [usaAddon, setUsaAddon] = useState(false);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [configureTypeLoading, setConfigureTypeLoading] = useState<
        null | "GERAL" | "BOX" | "WEBHOOK"
    >(null);

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

    const handleSaveGeneral = async () => {
        if (!equipment) return;
        setSaving(true);
        try {
            // We only update the config payload
            await apiPatch(`/instituicao/${codigoInstituicao}/equipamento/${equipment.EQPCodigo}`, {
                EQPConfig: form,
                EQPUsaAddon: usaAddon
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
        <div className="space-y-6">
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
                    {[
                        { id: 'geral', name: 'Geral' },
                        { id: 'horarios', name: 'Horários' },
                        { id: 'departamentos', name: 'Departamentos' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
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
                            <div className="flex flex-wrap gap-2">
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
                                        disabled={configureTypeLoading !== null}
                                        onClick={() => handleConfigureEquipment(type)}
                                    >
                                        {configureTypeLoading === type ? "Aplicando..." : label}
                                    </Button>
                                ))}
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

                {activeTab === 'horarios' && (
                    <SchedulesTab
                        institutionId={Number(codigoInstituicao)}
                        equipmentId={Number(equipment.EQPCodigo)}
                        config={equipment.EQPConfig}
                        mainIp={equipment.EQPEnderecoIp}
                    />
                )}

                {activeTab === 'departamentos' && (
                    <DepartmentsTab
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

function SchedulesTab({ institutionId, equipmentId, config, mainIp }: TabProps) {
    const { showToast } = useToast();
    const { ips, selectedIp, setSelectedIp } = useIpSelection(config, mainIp);
    const [schedules, setSchedules] = useState<TimeZone[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal state for Horário
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
    const [editingScheduleName, setEditingScheduleName] = useState("");
    const [editingSpans, setEditingSpans] = useState<TimeSpan[]>([]);

    // Sub-modal state for Faixa de Horário
    const [isSpanModalOpen, setIsSpanModalOpen] = useState(false);
    const [editingSpanIndex, setEditingSpanIndex] = useState<number | null>(null);
    const [currentSpan, setCurrentSpan] = useState<TimeSpan | null>(null);

    const loadSchedules = useCallback(async () => {
        if (!selectedIp) return;
        setLoading(true);
        try {
            // Fetch time_zones
            const tzRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: { object: 'time_zones' },
                targetIp: selectedIp
            });
            const timeZones: TimeZone[] = tzRes.time_zones || [];

            // Fetch time_spans (bulk)
            const tsRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: {
                    object: 'time_spans',
                    where: [],
                    limit: 1000
                },
                targetIp: selectedIp
            });
            const timeSpans: TimeSpan[] = tsRes.time_spans || [];

            // Group spans by time_zone_id
            const grouped = timeZones.map(tz => ({
                ...tz,
                spans: timeSpans.filter((span: TimeSpan) => span.time_zone_id === tz.id)
            }));

            setSchedules(grouped);
        } catch (e) {
            console.error(e);
            showToast("error", "Erro", "Falha ao carregar horários e faixas.");
            setSchedules([]);
        } finally {
            setLoading(false);
        }
    }, [institutionId, equipmentId, selectedIp, showToast]);

    useEffect(() => { loadSchedules(); }, [loadSchedules]);

    const handleSaveSchedule = async () => {
        if (!editingScheduleName || !selectedIp) return;
        setLoading(true);
        try {
            if (editingScheduleId) {
                // EDIT MODE
                const originalTz = schedules.find(s => s.id === editingScheduleId);

                // 1. Update name if changed
                if (originalTz && originalTz.name !== editingScheduleName) {
                    await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                        command: 'modify_objects',
                        params: {
                            object: 'time_zones',
                            values: { name: editingScheduleName },
                            where: { time_zones: { id: editingScheduleId } }
                        },
                        targetIp: selectedIp
                    });
                }

                const originalSpans = originalTz?.spans || [];

                // 2. Delete removed spans
                const toDelete = originalSpans.filter(orig => !editingSpans.some(es => es.id === orig.id));
                for (const span of toDelete) {
                    if (span.id) {
                        await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                            command: 'destroy_objects',
                            params: {
                                object: 'time_spans',
                                where: { time_spans: { id: span.id } }
                            },
                            targetIp: selectedIp
                        });
                    }
                }

                // 3. Add new spans
                const toAdd = editingSpans.filter(es => !es.id).map(s => ({ ...s, time_zone_id: editingScheduleId }));
                if (toAdd.length) {
                    await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                        command: 'create_objects',
                        params: {
                            object: 'time_spans',
                            values: toAdd
                        },
                        targetIp: selectedIp
                    });
                }

                // 4. Modify existing spans
                const toModify = editingSpans.filter(es => es.id);
                for (const span of toModify) {
                    const { id, time_zone_id, ...valuesToUpdate } = span;
                    await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                        command: 'modify_objects',
                        params: {
                            object: 'time_spans',
                            values: valuesToUpdate,
                            where: { time_spans: { id: span.id } }
                        },
                        targetIp: selectedIp
                    });
                }

                showToast("success", "Sucesso", "Horário atualizado.");
            } else {
                // CREATE MODE
                // 1. Create Time Zone
                const tzRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                    command: 'create_objects',
                    params: {
                        object: 'time_zones',
                        values: [{ name: editingScheduleName }]
                    },
                    targetIp: selectedIp
                });
                const newTzId = tzRes.ids?.[0];

                // 2. Create Time Spans if any
                if (newTzId && editingSpans.length > 0) {
                    const spanValues = editingSpans.map(span => ({ ...span, time_zone_id: newTzId }));
                    await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                        command: 'create_objects',
                        params: {
                            object: 'time_spans',
                            values: spanValues
                        },
                        targetIp: selectedIp
                    });
                }
                showToast("success", "Sucesso", "Horário criado.");
            }

            setIsScheduleModalOpen(false);
            setEditingScheduleId(null);
            setEditingScheduleName("");
            setEditingSpans([]);
            loadSchedules();
        } catch (e) {
            showToast("error", "Erro", "Falha ao salvar horário.");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!selectedIp) return;
        if (!confirm("Tem certeza que deseja remover este Horário e todas as suas faixas?")) return;

        try {
            // First destroy related time_spans
            await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'destroy_objects',
                params: {
                    object: 'time_spans',
                    where: { time_zones: { id } }
                },
                targetIp: selectedIp
            });

            // Then destroy time_zone
            await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'destroy_objects',
                params: {
                    object: 'time_zones',
                    where: { time_zones: { id } }
                },
                targetIp: selectedIp
            });

            showToast("success", "Sucesso", "Horário removido.");
            loadSchedules();
        } catch (e) {
            showToast("error", "Erro", "Falha ao remover horário.");
        }
    };

    // Helper: format seconds to HH:mm
    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    // Helper: parse HH:mm to seconds. Add 59 seconds to end times to cover the full minute.
    const parseTime = (timeStr: string, isEnd = false) => {
        const [h, m] = timeStr.split(':').map(Number);
        let seconds = (h * 3600) + (m * 60);
        if (isEnd) seconds += 59;
        return seconds;
    };

    const formatDays = (span: TimeSpan) => {
        const days = [];
        if (span.sun) days.push("Dom");
        if (span.mon) days.push("Seg");
        if (span.tue) days.push("Ter");
        if (span.wed) days.push("Qua");
        if (span.thu) days.push("Qui");
        if (span.fri) days.push("Sex");
        if (span.sat) days.push("Sáb");
        if (span.hol1) days.push("Fer1");
        if (span.hol2) days.push("Fer2");
        if (span.hol3) days.push("Fer3");
        return days.join(", ");
    };

    const openNewScheduleModal = () => {
        setEditingScheduleId(null);
        setEditingScheduleName("");
        setEditingSpans([]);
        setIsScheduleModalOpen(true);
    };

    const openEditScheduleModal = (tz: TimeZone) => {
        setEditingScheduleId(tz.id);
        setEditingScheduleName(tz.name);
        setEditingSpans(tz.spans ? [...tz.spans] : []);
        setIsScheduleModalOpen(true);
    };

    const openNewSpanModal = () => {
        setCurrentSpan({
            start: 28800, // 08:00
            end: 53999, // 14:59:59 (approx 14:59 in UI)
            sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1,
            hol1: 1, hol2: 1, hol3: 1
        });
        setEditingSpanIndex(null);
        setIsSpanModalOpen(true);
    };

    const openEditSpanModal = (span: TimeSpan, index: number) => {
        setCurrentSpan({ ...span });
        setEditingSpanIndex(index);
        setIsSpanModalOpen(true);
    };

    const saveSpan = () => {
        if (!currentSpan) return;
        if (editingSpanIndex !== null) {
            const up = [...editingSpans];
            up[editingSpanIndex] = currentSpan;
            setEditingSpans(up);
        } else {
            setEditingSpans([...editingSpans, currentSpan]);
        }
        setIsSpanModalOpen(false);
    };

    const removeSpan = (idx: number) => {
        setEditingSpans(editingSpans.filter((_, i) => i !== idx));
    };

    const toggleSpanDay = (day: keyof TimeSpan) => {
        if (currentSpan) {
            setCurrentSpan({ ...currentSpan, [day]: currentSpan[day] ? 0 : 1 });
        }
    };

    const DayToggle = ({ label, day }: { label: string, day: keyof TimeSpan }) => {
        if (!currentSpan) return null;
        const active = !!currentSpan[day];
        return (
            <div className="flex flex-col gap-1">
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                <div
                    onClick={() => toggleSpanDay(day)}
                    className="flex w-20 h-8 rounded border dark:border-gray-600 overflow-hidden cursor-pointer"
                >
                    <div className={`flex-1 flex items-center justify-center ${active ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        {active && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        )}
                    </div>
                    <div className={`flex-1 flex items-center justify-center ${!active ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        {!active && (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex gap-6 relative">
            {/* Vertical Tabs */}
            <div className="w-1/4 space-y-1">
                {ips.map(item => (
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

            {/* Content */}
            <div className="flex-1 space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Gerenciar Horários</h3>
                    <Button onClick={openNewScheduleModal}>Novo Horário</Button>
                </div>

                {loading ? <p>Carregando...</p> : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Faixas Configuradas</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {schedules.map(s => (
                                    <tr key={s.id}>
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{s.id}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{s.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {s.spans && s.spans.length > 0 ? (
                                                <div className="space-y-1">
                                                    {s.spans.map((span, idx) => (
                                                        <div key={idx} className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 inline-block mr-2 mb-1 border border-gray-200 dark:border-gray-600">
                                                            <strong className="text-gray-700 dark:text-gray-300">{formatTime(span.start)} - {formatTime(span.end)}</strong><br />
                                                            <span className="opacity-80 mt-1 block">{formatDays(span)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="italic">Nenhuma faixa</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm align-top">
                                            <div className="flex gap-2 justify-end">
                                                <Button variant="outline" size="sm" onClick={() => openEditScheduleModal(s)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-gray-200 dark:border-gray-700 mt-1">Editar</Button>
                                                <Button variant="outline" size="sm" onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 border-gray-200 dark:border-gray-700 mt-1">Remover</Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {schedules.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">Nenhum horário cadastrado.</p>}
                    </div>
                )}
            </div>

            {/* Schedule Modal */}
            {isScheduleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{editingScheduleId ? 'Editar Horário' : 'Adicionar Horário'}</h3>
                            <button onClick={() => setIsScheduleModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Horário</label>
                                <input
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                    value={editingScheduleName}
                                    placeholder="Ex: Comercial"
                                    onChange={e => setEditingScheduleName(e.target.value)}
                                />
                            </div>

                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                                <div className="bg-gray-50 dark:bg-gray-900/50 p-3 flex border-b dark:border-gray-700 gap-2 items-center justify-between">
                                    <h4 className="font-medium text-gray-700 dark:text-white">Faixas de Horário</h4>
                                    <Button size="sm" onClick={openNewSpanModal} className="bg-green-600 hover:bg-green-700 text-white border-none shrink-0 shadow-sm leading-none flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Adicionar
                                    </Button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-white dark:bg-gray-800 text-xs text-gray-500 font-medium">
                                            <tr>
                                                <th className="px-3 py-3 text-left uppercase">Início</th>
                                                <th className="px-3 py-3 text-left uppercase">Fim</th>
                                                <th className="px-2 py-3 text-center">Dom</th>
                                                <th className="px-2 py-3 text-center">Seg</th>
                                                <th className="px-2 py-3 text-center">Ter</th>
                                                <th className="px-2 py-3 text-center">Qua</th>
                                                <th className="px-2 py-3 text-center">Qui</th>
                                                <th className="px-2 py-3 text-center">Sex</th>
                                                <th className="px-2 py-3 text-center">Sáb</th>
                                                <th className="px-2 py-3 text-center">Fer 1</th>
                                                <th className="px-2 py-3 text-center">Fer 2</th>
                                                <th className="px-2 py-3 text-center">Fer 3</th>
                                                <th className="px-3 py-3 text-center uppercase">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-sm dark:text-white text-center bg-gray-50 dark:bg-gray-900/20">
                                            {editingSpans.length === 0 && (
                                                <tr><td colSpan={13} className="py-8 text-gray-500 italic">Nenhuma faixa adicionada. Clique em Adicionar.</td></tr>
                                            )}
                                            {editingSpans.map((span, idx) => (
                                                <tr key={idx} className="hover:bg-white dark:hover:bg-gray-800 transition-colors">
                                                    <td className="px-3 py-3 text-left font-medium">{formatTime(span.start)}</td>
                                                    <td className="px-3 py-3 text-left font-medium">{formatTime(span.end)}</td>
                                                    <td className="px-2 py-3">{span.sun ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.mon ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.tue ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.wed ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.thu ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.fri ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.sat ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.hol1 ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.hol2 ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-2 py-3">{span.hol3 ? '✅' : <span className="text-gray-300 dark:text-gray-600">✖</span>}</td>
                                                    <td className="px-3 py-3 flex gap-2 justify-center">
                                                        <button type="button" onClick={() => openEditSpanModal(span, idx)} className="text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 p-1.5 rounded transition-colors" title="Editar">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                        </button>
                                                        <button type="button" onClick={() => removeSpan(idx)} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 p-1.5 rounded transition-colors" title="Remover">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                            <Button variant="outline" onClick={() => setIsScheduleModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveSchedule} className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md" disabled={!editingScheduleName || editingSpans.length === 0 || loading}>
                                {loading ? 'Ocupado...' : 'Salvar Horário Completo'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Time Span Sub-Modal */}
            {isSpanModalOpen && currentSpan && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
                        <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{editingSpanIndex !== null ? 'Editar Faixa de Horário' : 'Adicionar Faixa de Horário'}</h3>
                            <button onClick={() => setIsSpanModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto space-y-8">
                            <div className="flex gap-6">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hora de Início</label>
                                    <div className="relative">
                                        <input
                                            type="time"
                                            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                            value={formatTime(currentSpan.start)}
                                            onChange={e => setCurrentSpan({ ...currentSpan, start: parseTime(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hora de Fim (inclusive)</label>
                                    <div className="relative">
                                        <input
                                            type="time"
                                            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                            value={formatTime(currentSpan.end)}
                                            onChange={e => setCurrentSpan({ ...currentSpan, end: parseTime(e.target.value, true) })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block border-b pb-2 dark:border-gray-700">Dias Válidos</h4>
                                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                                    <DayToggle label="Domingo" day="sun" />
                                    <DayToggle label="Segunda" day="mon" />
                                    <DayToggle label="Terça" day="tue" />
                                    <DayToggle label="Quarta" day="wed" />
                                    <DayToggle label="Quinta" day="thu" />
                                    <DayToggle label="Sexta" day="fri" />
                                    <DayToggle label="Sábado" day="sat" />
                                    <DayToggle label="Feriados 1" day="hol1" />
                                    <DayToggle label="Feriados 2" day="hol2" />
                                    <DayToggle label="Feriados 3" day="hol3" />
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                            <Button variant="outline" onClick={() => setIsSpanModalOpen(false)}>Descartar</Button>
                            <Button onClick={saveSpan} className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md px-6">Salvar Faixa</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


function DepartmentsTab({ institutionId, equipmentId, config, mainIp }: TabProps) {
    const { showToast } = useToast();
    const { ips, selectedIp, setSelectedIp } = useIpSelection(config, mainIp);

    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState("");

    // Binding Modal State
    const [isBindingModalOpen, setIsBindingModalOpen] = useState(false);
    const [selectedDepartment, setSelectedDepartment] = useState<any | null>(null);
    const [availableTimeZones, setAvailableTimeZones] = useState<TimeZone[]>([]);
    const [mappedTimeZoneIds, setMappedTimeZoneIds] = useState<number[]>([]);

    // ControlID Relational state for the active Department
    const [activeAccessRuleId, setActiveAccessRuleId] = useState<number | null>(null);

    const loadDepartments = useCallback(async () => {
        if (!selectedIp) return;
        setLoading(true);
        try {
            const res = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: { object: 'groups' },
                targetIp: selectedIp
            });
            setDepartments(res.groups || []);
        } catch (e) {
            console.error(e);
            showToast("error", "Erro", "Falha ao carregar departamentos.");
            setDepartments([]);
        } finally {
            setLoading(false);
        }
    }, [institutionId, equipmentId, selectedIp, showToast]);

    useEffect(() => { loadDepartments(); }, [loadDepartments]);

    const handleAdd = async () => {
        if (!newName || !selectedIp) return;
        try {
            await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'create_objects',
                params: {
                    object: 'departments',
                    values: [{ name: newName }]
                },
                targetIp: selectedIp
            });
            showToast("success", "Sucesso", "Departamento criado.");
            setNewName("");
            loadDepartments();
        } catch (e) {
            showToast("error", "Erro", "Falha ao criar departamento.");
        }
    };

    const handleDelete = async (id: number) => {
        if (!selectedIp) return;
        if (!confirm("Tem certeza?")) return;
        try {
            await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'destroy_objects',
                params: {
                    object: 'departments',
                    where: { departments: { id } }
                },
                targetIp: selectedIp
            });
            showToast("success", "Sucesso", "Departamento removido.");
            loadDepartments();
        } catch (e) {
            showToast("error", "Erro", "Falha ao remover departamento.");
        }
    };

    // --- Time Zone Binding Logic ---
    const openBindingModal = async (department: any) => {
        if (!selectedIp) return;
        setSelectedDepartment(department);
        setLoading(true);

        try {
            // 1. Load all available Time Zones
            const tzRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: { object: 'time_zones' },
                targetIp: selectedIp
            });
            setAvailableTimeZones(tzRes.time_zones || []);

            // 2. Map existing Time Zones directly via ControlID relation query
            const mapRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: {
                    object: 'time_zones',
                    join: 'LEFT',
                    where: [{
                        object: 'groups',
                        field: 'id',
                        value: department.id,
                        connector: ") AND ("
                    }],
                    limit: 1000
                },
                targetIp: selectedIp
            });
            const mappedIds = (mapRes.time_zones || []).map((tz: any) => tz.id);
            setMappedTimeZoneIds(mappedIds);

            // 3. Load access rule linked to this department internally for saving deltas later
            const arRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: {
                    object: 'access_rules',
                    join: 'LEFT',
                    where: [{
                        object: 'groups',
                        field: 'id',
                        value: department.id,
                        connector: ") AND ("
                    }]
                },
                targetIp: selectedIp
            });

            if (arRes.access_rules && arRes.access_rules.length > 0) {
                setActiveAccessRuleId(arRes.access_rules[0].id);
            } else {
                setActiveAccessRuleId(null);
            }

            setIsBindingModalOpen(true);
        } catch (e) {
            showToast("error", "Erro", "Falha ao carregar horários do departamento.");
        } finally {
            setLoading(false);
        }
    };

    const toggleTimeZoneBinding = (tzId: number) => {
        setMappedTimeZoneIds(prev =>
            prev.includes(tzId)
                ? prev.filter(id => id !== tzId)
                : [...prev, tzId]
        );
    };

    const handleSaveBindings = async () => {
        if (!selectedDepartment || !selectedIp) return;
        setLoading(true);
        let currentRuleId = activeAccessRuleId;

        try {
            // 1. If we have mappings but no access rule, create the whole structure
            if (!currentRuleId && mappedTimeZoneIds.length > 0) {
                // Create Access Rule
                const newRuleRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                    command: 'create_objects',
                    params: {
                        object: 'access_rules',
                        values: [{
                            name: `(access_rules automatically created for groups ${selectedDepartment.id})`,
                            type: 1,
                            priority: 0
                        }]
                    },
                    targetIp: selectedIp
                });
                currentRuleId = newRuleRes.ids?.[0];
                setActiveAccessRuleId(currentRuleId);

                if (currentRuleId) {
                    // Fetch Portals to bind (required for the access rule to be valid on the device)
                    // We assume it returns the active portals for the device we're talking to.
                    const portalRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                        command: 'load_objects',
                        params: {
                            object: 'portals',
                            limit: 1000
                        },
                        targetIp: selectedIp
                    });

                    const portals = portalRes.portals || [];

                    // Bind Portals to Access Rule
                    for (const portal of portals) {
                        try {
                            await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                                command: 'create_objects',
                                params: {
                                    object: 'portal_access_rules',
                                    values: [{ portal_id: portal.id, access_rule_id: currentRuleId }]
                                },
                                targetIp: selectedIp
                            });
                        } catch (e) { /* ignore if already exists */ }
                    }

                    // Bind Group directly to Access Rule
                    try {
                        await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                            command: 'create_objects',
                            params: {
                                object: 'group_access_rules',
                                values: [{ group_id: selectedDepartment.id, access_rule_id: currentRuleId }]
                            },
                            targetIp: selectedIp
                        });
                    } catch (e) { /* ignore if exists */ }
                }
            }

            if (currentRuleId) {
                // 2. We have a rule ID. Now reconcile the time_zones mapping
                // First, load current mappings directly to know what to delete/add
                const currentMapRes = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                    command: 'load_objects',
                    params: {
                        object: 'access_rule_time_zones',
                        where: [{
                            object: 'access_rule_time_zones',
                            field: 'access_rule_id',
                            value: currentRuleId
                        }]
                    },
                    targetIp: selectedIp
                });

                const currentMappings: any[] = currentMapRes.access_rule_time_zones || [];
                const currentMappedTzIds = currentMappings.map(m => m.time_zone_id);

                // Determine what to delete (exists in device but not in state)
                const toDelete = currentMappings.filter(m => !mappedTimeZoneIds.includes(m.time_zone_id));
                for (const mapping of toDelete) {
                    await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                        command: 'destroy_objects',
                        params: {
                            object: 'access_rule_time_zones',
                            where: { access_rule_time_zones: { id: mapping.id } }
                        },
                        targetIp: selectedIp
                    });
                }

                // Determine what to add (exists in state but not in device)
                const toAddIds = mappedTimeZoneIds.filter(id => !currentMappedTzIds.includes(id));
                if (toAddIds.length > 0) {
                    const valuesToAdd = toAddIds.map(tzId => ({ access_rule_id: currentRuleId, time_zone_id: tzId }));
                    await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                        command: 'create_objects',
                        params: {
                            object: 'access_rule_time_zones',
                            values: valuesToAdd
                        },
                        targetIp: selectedIp
                    });
                }
            }

            showToast("success", "Sucesso", "Horários atualizados para o departamento.");
            setIsBindingModalOpen(false);
        } catch (e) {
            console.error(e);
            showToast("error", "Erro", "Falha ao salvar horários.");
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="flex gap-6 relative">
            {/* Vertical Tabs */}
            <div className="w-1/4 space-y-1">
                {ips.map(item => (
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
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Gerenciar Departamentos</h3>

                <div className="flex gap-2">
                    <input
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                        placeholder="Nome do novo departamento"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                    />
                    <Button onClick={handleAdd} disabled={!newName || loading}>Adicionar</Button>
                </div>

                {loading ? <p>Carregando...</p> : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg overflow-hidden">
                        {departments.map(d => (
                            <div key={d.id} className="p-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{d.name} <span className="text-gray-400 font-normal">(ID: {d.id})</span></span>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => openBindingModal(d)} className="text-brand-600 hover:text-brand-800 hover:bg-brand-50 border-gray-200 dark:border-gray-700">Horários</Button>
                                    <Button variant="outline" size="sm" onClick={() => handleDelete(d.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 border-gray-200 dark:border-gray-700">Excluir</Button>
                                </div>
                            </div>
                        ))}
                        {departments.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">Nenhum departamento cadastrado.</p>}
                    </div>
                )}
            </div>

            {/* Department Bindings Modal */}
            {isBindingModalOpen && selectedDepartment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Horários de Acesso</h3>
                                <p className="text-sm text-gray-500">{selectedDepartment.name}</p>
                            </div>
                            <button onClick={() => setIsBindingModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-6 flex-1 overflow-y-auto space-y-4">
                            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                                Selecione quais horários de acesso são permitidos para os usuários deste departamento.
                            </p>
                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-200 dark:divide-gray-700">
                                {availableTimeZones.map(tz => (
                                    <label key={tz.id} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                                        <div className="flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                checked={mappedTimeZoneIds.includes(tz.id)}
                                                onChange={() => toggleTimeZoneBinding(tz.id)}
                                                className="w-5 h-5 text-brand-600 rounded border-gray-300 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-brand-500 dark:focus:ring-offset-gray-800"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">{tz.name}</span>
                                            <span className="text-xs text-gray-500">ID: {tz.id}</span>
                                        </div>
                                    </label>
                                ))}
                                {availableTimeZones.length === 0 && (
                                    <p className="p-6 text-center text-sm text-gray-500 italic">Nenhum horário cadastrado no equipamento. Crie um na aba "Horários" primeiro.</p>
                                )}
                            </div>
                        </div>
                        <div className="p-5 border-t dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50">
                            <Button variant="outline" onClick={() => setIsBindingModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveBindings} className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-md" disabled={loading}>
                                {loading ? 'Salvando...' : 'Salvar Vínculos'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
