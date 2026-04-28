"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { AlertIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import LimiarFacialSlider from "@/components/form/LimiarFacialSlider";

interface Instituicao {
    INSCodigo: number;
    INSNome: string;
    CLICodigo: number;
    INSAtivo: boolean;
    INSMaxExecucoesSimultaneas: number;
    INSFusoHorario?: number;
    INSToleranciaEntradaMinutos?: number;
    INSToleranciaSaidaMinutos?: number;
    INSTLimiarFacialDefault?: number;
    INSConfigHardware?: any;
    cliente?: { CLINome: string };
}

interface Cliente {
    CLICodigo: number;
    CLINome: string;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

/** Base pública do backend sem `/api` (o path do monitor já inclui `/api/...` quando necessário). */
function defaultMonitorServerHost(): string {
    const raw = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
    if (!raw) return "";
    return raw.replace(/\/api\/?$/i, "").replace(/\/$/, "");
}

/** Porta padrão do monitor conforme o esquema da URL do servidor; sem `http(s)://` → 443. */
function defaultMonitorPortForHost(hostOrUrl: string): number {
    const raw = hostOrUrl?.trim() ?? "";
    if (!raw) return 443;
    if (/^https:\/\//i.test(raw)) return 443;
    if (/^http:\/\//i.test(raw)) return 80;
    return 443;
}

export default function InstituicoesGlobalPage() {
    const { isGlobal, isSuperRoot } = useAuth();
    const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Instituicao | null>(null);
    const [form, setForm] = useState<{
        INSNome: string;
        CLICodigo: number;
        INSMaxExecucoesSimultaneas: number;
        INSFusoHorario: number;
        INSToleranciaEntradaMinutos: number;
        INSToleranciaSaidaMinutos: number;
        INSTLimiarFacialDefault: number;
        INSConfigHardware?: any;
    }>({
        INSNome: "",
        CLICodigo: 0,
        INSMaxExecucoesSimultaneas: 8,
        INSFusoHorario: -3,
        INSToleranciaEntradaMinutos: 15,
        INSToleranciaSaidaMinutos: 15,
        INSTLimiarFacialDefault: 680,
    });
    const [saving, setSaving] = useState(false);

    const [alert, setAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'toggle', id: number, name: string, active?: boolean } | null>(null);

    const load = useCallback(async () => {
        if (!isGlobal) return;
        setLoading(true);
        try {
            const [instRes, cliRes] = await Promise.all([
                apiGet<{ data: Instituicao[]; meta: Meta }>(`/instituicoes?page=${page}&limit=${limit}`),
                apiGet<{ data: Cliente[] }>("/clientes?limit=100")
            ]);
            setInstituicoes(instRes.data || []);
            setMeta(instRes.meta);
            setClientes(cliRes.data || []);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [isGlobal, page, limit]);

    useEffect(() => { load(); }, [load]);

    // Clear alert after 3 seconds
    useEffect(() => {
        if (alert) {
            const timer = setTimeout(() => setAlert(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [alert]);

    const openNew = () => {
        setEditing(null);
        const host = defaultMonitorServerHost();
        const port = host ? defaultMonitorPortForHost(host) : undefined;
        setForm({
            INSNome: "",
            CLICodigo: clientes[0]?.CLICodigo || 0,
            INSMaxExecucoesSimultaneas: 8,
            INSFusoHorario: -3,
            INSToleranciaEntradaMinutos: 15,
            INSToleranciaSaidaMinutos: 15,
            INSTLimiarFacialDefault: 680,
            INSConfigHardware: host
                ? {
                    controlid: {
                        monitor: {
                            ip: host,
                            ...(port !== undefined ? { port } : {}),
                        },
                    },
                }
                : {},
        });
        setShowModal(true);
    };

    const openEdit = (i: Instituicao) => {
        setEditing(i);
        const existingConfig = i.INSConfigHardware || {};
        const controlid = existingConfig.controlid || {};
        const monitor = controlid.monitor || {};

        // Ensure path is set if missing
        if (!monitor.path) {
            monitor.path = `/api/instituicao/${i.INSCodigo}/monitor/controlid`;
        }

        const newConfig = {
            ...existingConfig,
            controlid: {
                ...controlid,
                monitor
            }
        };

        setForm({
            INSNome: i.INSNome,
            CLICodigo: i.CLICodigo,
            INSMaxExecucoesSimultaneas: i.INSMaxExecucoesSimultaneas || 8,
            INSFusoHorario: i.INSFusoHorario ?? -3,
            INSToleranciaEntradaMinutos: i.INSToleranciaEntradaMinutos ?? 15,
            INSToleranciaSaidaMinutos: i.INSToleranciaSaidaMinutos ?? 15,
            INSTLimiarFacialDefault: i.INSTLimiarFacialDefault ?? 680,
            INSConfigHardware: newConfig
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let payload = form;
            if (!editing) {
                const envHost = defaultMonitorServerHost();
                const mon = form.INSConfigHardware?.controlid?.monitor;
                const ip = mon?.ip?.trim() ?? "";
                const portNum = typeof mon?.port === "number" ? mon.port : Number(mon?.port);
                const needsPort = !portNum || portNum === 0;

                if (envHost && !ip) {
                    const INSConfigHardware = { ...form.INSConfigHardware };
                    if (!INSConfigHardware.controlid) INSConfigHardware.controlid = {};
                    if (!INSConfigHardware.controlid.monitor) INSConfigHardware.controlid.monitor = {};
                    INSConfigHardware.controlid.monitor.ip = envHost;
                    INSConfigHardware.controlid.monitor.port = defaultMonitorPortForHost(envHost);
                    payload = { ...form, INSConfigHardware };
                } else if (ip && needsPort) {
                    const INSConfigHardware = { ...form.INSConfigHardware };
                    if (!INSConfigHardware.controlid) INSConfigHardware.controlid = {};
                    if (!INSConfigHardware.controlid.monitor) INSConfigHardware.controlid.monitor = {};
                    INSConfigHardware.controlid.monitor.port = defaultMonitorPortForHost(ip);
                    payload = { ...form, INSConfigHardware };
                }
            }
            if (editing) {
                await apiPatch(`/instituicoes/${editing.INSCodigo}`, payload);
                setAlert({ type: 'success', message: 'Instituição atualizada com sucesso.' });
            } else {
                await apiPost("/instituicoes", payload);
                setAlert({ type: 'success', message: 'Instituição criada com sucesso.' });
            }
            setShowModal(false);
            load();
        } catch {
            setAlert({ type: 'error', message: 'Erro ao salvar instituição.' });
        } finally { setSaving(false); }
    };

    const confirmToggleStatus = (i: Instituicao) => {
        setConfirmAction({
            type: 'toggle',
            id: i.INSCodigo,
            name: i.INSNome,
            active: i.INSAtivo
        });
    };

    const confirmDelete = (i: Instituicao) => {
        setConfirmAction({
            type: 'delete',
            id: i.INSCodigo,
            name: i.INSNome
        });
    };

    const handleConfirmAction = async () => {
        if (!confirmAction) return;

        try {
            if (confirmAction.type === 'delete') {
                await apiDelete(`/instituicoes/${confirmAction.id}`);
                setAlert({ type: 'success', message: 'Instituição excluída com sucesso.' });
            } else if (confirmAction.type === 'toggle') {
                await apiPatch(`/instituicoes/${confirmAction.id}`, { INSAtivo: !confirmAction.active });
                setAlert({ type: 'success', message: `Instituição ${!confirmAction.active ? 'ativada' : 'inativada'} com sucesso.` });
            }
            load();
        } catch (error) {
            setAlert({ type: 'error', message: 'Erro ao processar a ação.' });
        } finally {
            setConfirmAction(null);
        }
    };

    if (!isGlobal) return <div className="p-6">Acesso negado.</div>;

    return (
        <div className="space-y-6">
            {alert && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg text-white ${alert.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {alert.message}
                </div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Instituições (Global)</h2>
                <Button size="sm" onClick={openNew}>+ Nova Instituição</Button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">ID</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Cliente</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Workers Max</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : instituicoes.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhuma instituição encontrada.</td></tr>
                        ) : instituicoes.map((i) => (
                            <tr key={i.INSCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{i.INSCodigo}</td>
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{i.INSNome}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{i.cliente?.CLINome || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{i.INSMaxExecucoesSimultaneas}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${i.INSAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{i.INSAtivo ? "Ativo" : "Inativo"}</span>
                                </td>
                                <td className="px-5 py-3 flex gap-3">
                                    <button onClick={() => openEdit(i)} className="text-xs text-brand-500 hover:underline font-medium">Editar</button>
                                    {isSuperRoot && (
                                        <button
                                            onClick={() => confirmToggleStatus(i)}
                                            className={`text-xs font-medium hover:underline ${i.INSAtivo ? "text-amber-500" : "text-green-500"}`}
                                        >
                                            {i.INSAtivo ? "Inativar" : "Ativar"}
                                        </button>
                                    )}
                                    <button onClick={() => confirmDelete(i)} className="text-xs text-red-500 hover:underline font-medium">Excluir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Registros por página:</span>
                    <select
                        value={limit}
                        onChange={(e) => {
                            setLimit(Number(e.target.value));
                            setPage(1);
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>

                {meta.totalPages > 1 && (
                    <PaginationWithIcon
                        totalPages={meta.totalPages}
                        initialPage={page}
                        onPageChange={(p) => setPage(p)}
                    />
                )}

                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total: {meta.total} registros
                </p>
            </div>

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                className="modal-scroll-minimal max-h-[calc(100vh-100px)] max-w-2xl overflow-y-auto p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {editing ? "Editar Instituição" : "Nova Instituição"}
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Nome</label>
                            <input
                                placeholder="Nome da Instituição"
                                value={form.INSNome}
                                onChange={(e) => setForm({ ...form, INSNome: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Cliente</label>
                            <select
                                value={form.CLICodigo}
                                onChange={(e) => setForm({ ...form, CLICodigo: parseInt(e.target.value) })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                            >
                                <option value={0}>Selecione um Cliente</option>
                                {clientes.map(c => <option key={c.CLICodigo} value={c.CLICodigo}>{c.CLINome}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Max Execuções Simultâneas</label>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={form.INSMaxExecucoesSimultaneas}
                                onChange={(e) => setForm({ ...form, INSMaxExecucoesSimultaneas: parseInt(e.target.value) || 1 })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                            />
                            <p className="mt-1 text-[10px] text-gray-400">
                                Define o limite de workers paralelos para esta instituição.
                            </p>
                        </div>

                        <div>
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Fuso horário (UTC, horas)</label>
                            <input
                                type="number"
                                min={-12}
                                max={14}
                                value={form.INSFusoHorario}
                                onChange={(e) => setForm({ ...form, INSFusoHorario: parseInt(e.target.value, 10) || 0 })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                            />
                            <p className="mt-1 text-[10px] text-gray-400">
                                Offset em relação ao UTC (ex.: -3 para Brasília). Usado ao gravar eventos ControlID.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Tolerância de entrada (min)</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={10080}
                                    value={form.INSToleranciaEntradaMinutos}
                                    onChange={(e) => setForm({ ...form, INSToleranciaEntradaMinutos: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                />
                                <p className="mt-1 text-[10px] text-gray-400">Janela em minutos em relação ao horário de referência de entrada.</p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Tolerância de saída (min)</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={10080}
                                    value={form.INSToleranciaSaidaMinutos}
                                    onChange={(e) => setForm({ ...form, INSToleranciaSaidaMinutos: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                />
                                <p className="mt-1 text-[10px] text-gray-400">Janela em minutos em relação ao horário de referência de saída.</p>
                            </div>
                        </div>

                        <LimiarFacialSlider
                            id="inst-limiar-facial"
                            label="Limiar facial padrão (instituição)"
                            value={form.INSTLimiarFacialDefault}
                            onChange={(n) => setForm({ ...form, INSTLimiarFacialDefault: n })}
                        />

                        <div className="space-y-3 border-t border-gray-100 pt-2 dark:border-gray-800">
                            <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Hardware (ControlID Monitor)</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">IP do Monitor (Servidor)</label>
                                    <input
                                        placeholder="Ex: 192.168.1.10"
                                        value={form.INSConfigHardware?.controlid?.monitor?.ip || ""}
                                        onChange={(e) => {
                                            const newConfig = { ...form.INSConfigHardware };
                                            if (!newConfig.controlid) newConfig.controlid = {};
                                            if (!newConfig.controlid.monitor) newConfig.controlid.monitor = {};
                                            newConfig.controlid.monitor.ip = e.target.value;
                                            setForm({ ...form, INSConfigHardware: newConfig });
                                        }}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Porta</label>
                                    <input
                                        placeholder="Ex: 8000"
                                        value={form.INSConfigHardware?.controlid?.monitor?.port || ""}
                                        onChange={(e) => {
                                            const newConfig = { ...form.INSConfigHardware };
                                            if (!newConfig.controlid) newConfig.controlid = {};
                                            if (!newConfig.controlid.monitor) newConfig.controlid.monitor = {};
                                            newConfig.controlid.monitor.port = parseInt(e.target.value) || 0;
                                            setForm({ ...form, INSConfigHardware: newConfig });
                                        }}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Path Base (Opcional)</label>
                                    <input
                                        placeholder="Ex: /api/monitor"
                                        value={form.INSConfigHardware?.controlid?.monitor?.path || ""}
                                        onChange={(e) => {
                                            const newConfig = { ...form.INSConfigHardware };
                                            if (!newConfig.controlid) newConfig.controlid = {};
                                            if (!newConfig.controlid.monitor) newConfig.controlid.monitor = {};
                                            newConfig.controlid.monitor.path = e.target.value;
                                            setForm({ ...form, INSConfigHardware: newConfig });
                                        }}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                    />
                                    <p className="mt-1 text-[10px] text-gray-400">
                                        Caso o monitor esteja atrás de um proxy reverso.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-3 border-t border-gray-100 dark:border-gray-800">
                        <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !form.INSNome || !form.CLICodigo}>
                            {saving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={!!confirmAction}
                onClose={() => setConfirmAction(null)}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {confirmAction?.type === "delete"
                            ? "Confirmar Exclusão"
                            : confirmAction?.active
                                ? "Confirmar Inativação"
                                : "Confirmar Ativação"}
                    </h3>
                    {confirmAction?.type === "delete" ? (
                        <div className="flex items-start gap-4 rounded-xl bg-red-50 p-4 dark:bg-red-900/10">
                            <div className="flex-shrink-0">
                                <AlertIcon className="h-6 w-6 text-red-500" />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-red-800 dark:text-red-400">Atenção!</h4>
                                <p className="mt-1 text-sm text-red-700 dark:text-red-400/80">
                                    Tem certeza que deseja excluir a instituição <strong>{confirmAction.name}</strong>? Esta ação não pode ser desfeita.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div
                            className={`flex items-start gap-4 rounded-xl p-4 ${
                                confirmAction?.active
                                    ? "bg-amber-50 dark:bg-amber-900/10"
                                    : "bg-green-50 dark:bg-green-900/10"
                            }`}
                        >
                            <div className="flex-shrink-0">
                                <AlertIcon
                                    className={`h-6 w-6 ${
                                        confirmAction?.active ? "text-amber-500" : "text-green-600"
                                    }`}
                                />
                            </div>
                            <div>
                                <h4
                                    className={`text-sm font-semibold ${
                                        confirmAction?.active
                                            ? "text-amber-800 dark:text-amber-400"
                                            : "text-green-800 dark:text-green-400"
                                    }`}
                                >
                                    {confirmAction?.active ? "Inativar instituição" : "Ativar instituição"}
                                </h4>
                                <p
                                    className={`mt-1 text-sm ${
                                        confirmAction?.active
                                            ? "text-amber-800 dark:text-amber-400/90"
                                            : "text-green-800 dark:text-green-400/90"
                                    }`}
                                >
                                    {confirmAction?.active
                                        ? "Ao inativar, nenhum usuário deste tenant poderá acessar o sistema. Deseja inativar esta instituição?"
                                        : `Deseja ativar a instituição "${confirmAction?.name}"?`}
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleConfirmAction}
                            className={
                                confirmAction?.type === "delete" ||
                                (confirmAction?.type === "toggle" && confirmAction.active)
                                    ? "border-transparent bg-red-500 text-white hover:bg-red-600"
                                    : "border-transparent bg-green-600 text-white hover:bg-green-700"
                            }
                        >
                            Confirmar
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
