"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
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
    const { codigoInstituicao } = useTenant();
    const params = useParams();
    const router = useRouter();
    const { showToast } = useToast();

    // ID from URL might be string
    const codigoEquipamento = params.codigoEquipamento;

    const [equipment, setEquipment] = useState<Equipamento | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'geral' | 'horarios' | 'departamentos'>('geral');
    const [connectorOnline, setConnectorOnline] = useState(false);
    const [creatingSession, setCreatingSession] = useState(false);

    // General Form State
    const [form, setForm] = useState<any>({});
    const [usaAddon, setUsaAddon] = useState(false);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(false);

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
            setForm(res.EQPConfig || {});
            setUsaAddon(res.EQPUsaAddon || false);
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
        if (codigoEquipamento) {
            loadEquipment();
        }
    }, [codigoEquipamento, loadEquipment]);

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
                <Button
                    size="sm"
                    disabled={creatingSession}
                    onClick={async () => {
                        setCreatingSession(true);
                        try {
                            const session = await apiPost(
                                `/instituicao/${codigoInstituicao}/equipamento/${equipment.EQPCodigo}/remoto/sessoes`,
                                {},
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
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sentido de Entrada</label>
                                <select
                                    value={form.entry_direction || 'clockwise'}
                                    onChange={(e) => setForm({ ...form, entry_direction: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                >
                                    <option value="clockwise">Horário</option>
                                    <option value="counter_clockwise">Anti-Horário</option>
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
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IP iDFace Saída</label>
                                        <input
                                            placeholder="Ex: 192.168.1.102"
                                            value={form.ip_exit || ''}
                                            onChange={(e) => setForm({ ...form, ip_exit: e.target.value })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-brand-500 focus:border-brand-500"
                                        />
                                    </div>
                                </div>
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

function useIpSelection(config: any, mainIp: string | null) {
    const ips = [
        { label: "Principal", ip: mainIp, type: "main" },
        config?.ip_entry ? { label: "Entrada (Facial)", ip: config.ip_entry, type: "entry" } : null,
        config?.ip_exit ? { label: "Saída (Facial)", ip: config.ip_exit, type: "exit" } : null,
    ].filter(Boolean) as { label: string; ip: string; type: string }[];

    const [selectedIp, setSelectedIp] = useState<string>(mainIp || "");

    return { ips, selectedIp, setSelectedIp };
}

function SchedulesTab({ institutionId, equipmentId, config, mainIp }: TabProps) {
    const { showToast } = useToast();
    const { ips, selectedIp, setSelectedIp } = useIpSelection(config, mainIp);
    const [schedules, setSchedules] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState("");

    const loadSchedules = useCallback(async () => {
        if (!selectedIp) return;
        setLoading(true);
        try {
            const res = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: { object: 'time_zones' },
                targetIp: selectedIp
            });
            setSchedules(res.time_zones || []);
        } catch (e) {
            console.error(e);
            showToast("error", "Erro", "Falha ao carregar horários.");
            setSchedules([]);
        } finally {
            setLoading(false);
        }
    }, [institutionId, equipmentId, selectedIp, showToast]);

    useEffect(() => { loadSchedules(); }, [loadSchedules]);

    const handleAdd = async () => {
        if (!newName || !selectedIp) return;
        try {
            await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'create_objects',
                params: {
                    object: 'time_zones',
                    values: [{ name: newName }]
                },
                targetIp: selectedIp
            });
            showToast("success", "Sucesso", "Horário criado.");
            setNewName("");
            loadSchedules();
        } catch (e) {
            showToast("error", "Erro", "Falha ao criar horário.");
        }
    };

    const handleDelete = async (id: number) => {
        if (!selectedIp) return;
        if (!confirm("Tem certeza?")) return;
        try {
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

    return (
        <div className="flex gap-6">
            {/* Vertical Tabs */}
            <div className="w-1/4 space-y-1">
                {ips.map(item => (
                    <button
                        key={item.ip}
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
                </div>

                <div className="flex gap-2">
                    <input
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        placeholder="Nome do novo horário"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                    />
                    <Button onClick={handleAdd} disabled={!newName || loading}>Adicionar</Button>
                </div>

                {loading ? <p>Carregando...</p> : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg">
                        {schedules.map(s => (
                            <div key={s.id} className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{s.name} (ID: {s.id})</span>
                                <Button variant="outline" size="sm" onClick={() => handleDelete(s.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 border-none shadow-none">Excluir</Button>
                            </div>
                        ))}
                        {schedules.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">Nenhum horário cadastrado.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

function DepartmentsTab({ institutionId, equipmentId, config, mainIp }: TabProps) {
    const { showToast } = useToast();
    const { ips, selectedIp, setSelectedIp } = useIpSelection(config, mainIp);
    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [newName, setNewName] = useState("");

    const loadDepartments = useCallback(async () => {
        if (!selectedIp) return;
        setLoading(true);
        try {
            const res = await apiPost(`/instituicao/${institutionId}/hardware/${equipmentId}/command`, {
                command: 'load_objects',
                params: { object: 'departments' },
                targetIp: selectedIp
            });
            setDepartments(res.departments || []);
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

    return (
        <div className="flex gap-6">
            {/* Vertical Tabs */}
            <div className="w-1/4 space-y-1">
                {ips.map(item => (
                    <button
                        key={item.ip}
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
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        placeholder="Nome do novo departamento"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                    />
                    <Button onClick={handleAdd} disabled={!newName || loading}>Adicionar</Button>
                </div>

                {loading ? <p>Carregando...</p> : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700 border rounded-lg">
                        {departments.map(d => (
                            <div key={d.id} className="p-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{d.name} (ID: {d.id})</span>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => alert("Feature em breve: Vincular horários")}>Horários</Button>
                                    <Button variant="outline" size="sm" onClick={() => handleDelete(d.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 border-none shadow-none">Excluir</Button>
                                </div>
                            </div>
                        ))}
                        {departments.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">Nenhum departamento cadastrado.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
