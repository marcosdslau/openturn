"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/context/ToastContext";
import { AlertIcon, RefreshIcon, EyeIcon, EyeCloseIcon } from "@/icons";

const CONTROLID_MODELS = [
    { label: "iDAccess", value: "iDAccess", image: "/images/controlId/iDAccess.jpg" },
    { label: "iDAccess Nano", value: "iDAccess Nano", image: "/images/controlId/iDAccess_nano.jpg" },
    { label: "iDAccess Pro", value: "iDAccess Pro", image: "/images/controlId/iDAccess_pro.jpg" },
    { label: "iDAccess Prox", value: "iDAccess Prox", image: "/images/controlId/iDAccess-Prox.jpg" },
    { label: "iDBlock", value: "iDBlock", image: "/images/controlId/iDBlock.jpg" },
    { label: "iDBlock Balcão", value: "iDBlock Balcão", image: "/images/controlId/idblock_balcao.jpg" },
    { label: "iDBlock Braço Articulado", value: "iDBlock Braço Articulado", image: "/images/controlId/idblock_bqc.jpg" },
    { label: "iDBlock Facial", value: "iDBlock Facial", image: "/images/controlId/idblock_facial.jpg" },
    { label: "iDBlock Next", value: "iDBlock Next", image: "/images/controlId/idblock_next.jpg" },
    { label: "iDBlock PNE", value: "iDBlock PNE", image: "/images/controlId/idblock_pne.jpg" },
    { label: "iDFace", value: "iDFace", image: "/images/controlId/iDFace.jpg" },
    { label: "iDFace Max", value: "iDFace Max", image: "/images/controlId/idface_max.jpg" },
];

interface Equipamento {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
    EQPEnderecoIp: string | null;
    deviceId?: string | null;
    EQPAtivo: boolean;
    EQPConfig?: any;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

export default function EquipamentosPage() {
    const { codigoInstituicao } = useTenant();
    const { can } = usePermissions();
    const { showToast } = useToast();
    const maySyncHardware = can("equipamento", "update");
    const mayCreateEquip = can("equipamento", "create");
    const mayUpdateEquip = can("equipamento", "update");
    const mayDeleteEquip = can("equipamento", "delete");
    const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    // Modals
    const equipmentModal = useModal();
    const deleteModal = useModal();

    const [editing, setEditing] = useState<Equipamento | null>(null);
    const [form, setForm] = useState<{
        EQPDescricao: string;
        EQPMarca: string;
        EQPModelo: string;
        EQPEnderecoIp: string;
        deviceId?: string;
        EQPConfig?: any;
    }>({ EQPDescricao: "", EQPMarca: "", EQPModelo: "", EQPEnderecoIp: "", deviceId: "", EQPConfig: {} });
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Equipamento | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    type TestStatus = "idle" | "connecting" | "success" | "error";
    const [testStatus, setTestStatus] = useState<TestStatus>("idle");
    const [testError, setTestError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiGet<{ data: Equipamento[]; meta: Meta }>(`/instituicao/${codigoInstituicao}/equipamento?page=${page}&limit=${limit}`);
            setEquipamentos(res.data || []);
            setMeta(res.meta);
        } catch (error: any) {
            showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar os equipamentos.");
        } finally { setLoading(false); }
    }, [codigoInstituicao, page, limit, showToast]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing(null);
               setForm({
            EQPDescricao: "", EQPMarca: "", EQPModelo: "", EQPEnderecoIp: "", deviceId: "",
            EQPConfig: {
                user: 'admin', pass: 'admin', mode: 'standalone',
                entry_side: 'right',
                entry_direction_applied_by_equipment: false,
                entry_direction: 'clockwise',
            },
        });
        setTestStatus("idle");
        setTestError(null);
        equipmentModal.openModal();
    };

    const openEdit = (e: Equipamento) => {
        setEditing(e);
        const cfg = e.EQPConfig || { user: 'admin', pass: 'admin', mode: 'standalone' };
        setForm({
            EQPDescricao: e.EQPDescricao || "", EQPMarca: e.EQPMarca || "",
            EQPModelo: e.EQPModelo || "", EQPEnderecoIp: e.EQPEnderecoIp || "",
            deviceId: e.deviceId || '',
            EQPConfig: {
                ...cfg,
                entry_side: cfg.entry_side ?? (cfg.entry_direction === 'counter_clockwise' ? 'left' : 'right'),
                entry_direction_applied_by_equipment: cfg.entry_direction_applied_by_equipment ?? false,
            },
        });
        setTestStatus("idle");
        setTestError(null);
        equipmentModal.openModal();
    };

    const handleTestConnection = async () => {
        const cfg = form.EQPConfig || {};
        const roles: { role: "main" | "entry" | "exit"; ip: string }[] = [];
        const pushRole = (role: "main" | "entry" | "exit", ip?: string) => {
            const v = (ip || "").trim();
            if (v) roles.push({ role, ip: v });
        };
        pushRole("main", form.EQPEnderecoIp);
        pushRole("entry", cfg.ip_entry);
        pushRole("exit", cfg.ip_exit);

        if (roles.length === 0) {
            setTestStatus("error");
            setTestError("Informe ao menos um IP");
            return;
        }
        if (!form.EQPMarca) {
            setTestStatus("error");
            setTestError("Selecione a Marca antes de testar");
            return;
        }

        setTestStatus("connecting");
        setTestError(null);

        const payloadBase = {
            EQPMarca: form.EQPMarca,
            EQPModelo: form.EQPModelo || null,
            EQPConfig: form.EQPConfig,
        };

        type RoleResult = { role: "main" | "entry" | "exit"; ip: string; ok: boolean; deviceId?: string; error?: string };
        const roleResults: RoleResult[] = [];
        for (const r of roles) {
            try {
                const res = await apiPost<{ ok: boolean; deviceId?: string; error?: string }>(
                    `/instituicao/${codigoInstituicao}/hardware/test-connection`,
                    { ...payloadBase, ip: r.ip }
                );
                roleResults.push({ role: r.role, ip: r.ip, ok: res.ok, deviceId: res.deviceId, error: res.error });
            } catch (e: any) {
                roleResults.push({ role: r.role, ip: r.ip, ok: false, error: e?.message || "Falha na requisição" });
            }
        }

        const next = { ...form, EQPConfig: { ...(form.EQPConfig || {}) } } as typeof form;
        for (const r of roleResults) {
            if (!r.ok || !r.deviceId) continue;
            if (r.role === "main") {
                next.deviceId = r.deviceId;
                next.EQPConfig.deviceId = r.deviceId;
            } else if (r.role === "entry") {
                next.EQPConfig.deviceId_entry = r.deviceId;
            } else if (r.role === "exit") {
                next.EQPConfig.deviceId_exit = r.deviceId;
            }
        }
        setForm(next);

        const allOk = roleResults.every((r) => r.ok);
        if (allOk) {
            setTestStatus("success");
            setTestError(null);
            showToast("success", "Conexão bem-sucedida", `Testados ${roleResults.length} endereço(s) com sucesso.`);
        } else {
            setTestStatus("error");
            const firstFailed = roleResults.find((r) => !r.ok);
            const msg = firstFailed?.error || "Falha ao conectar";
            setTestError(msg);
            showToast("error", "Falha na conexão", msg);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/instituicao/${codigoInstituicao}/equipamento/${editing.EQPCodigo}`, form);
                showToast("success", "Equipamento atualizado", "Os dados foram salvos com sucesso.");
            } else {
                await apiPost(`/instituicao/${codigoInstituicao}/equipamento`, form);
                showToast("success", "Equipamento criado", "O novo equipamento foi cadastrado com sucesso.");
            }
            equipmentModal.closeModal();
            load();
        } catch (error: any) {
            showToast("error", "Erro ao salvar", error.message || "Ocorreu um erro ao processar a solicitação.");
        } finally { setSaving(false); }
    };

    const handleDeleteClick = (e: Equipamento) => {
        setDeleteTarget(e);
        deleteModal.openModal();
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await apiDelete(`/instituicao/${codigoInstituicao}/equipamento/${deleteTarget.EQPCodigo}`);
            showToast("success", "Equipamento removido", "O equipamento foi excluído com sucesso.");
            deleteModal.closeModal();
            load();
        } catch (error: any) {
            showToast("error", "Erro ao excluir", error.message || "Não foi possível remover o equipamento.");
        } finally { setSaving(false); }
    };

    const handleSync = async () => {
        try {
            await apiPost(`/instituicao/${codigoInstituicao}/hardware/sync`, {});
            showToast("success", "Sincronização iniciada", "O comando de sincronização foi enviado para todos os equipamentos.");
        } catch (error: any) {
            showToast("error", "Erro na sincronização", error.message || "Falha ao iniciar sincronização.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Equipamentos</h2>
                {(maySyncHardware || mayCreateEquip) && (
                    <div className="flex gap-2">
                        {maySyncHardware && (
                            <Button size="sm" variant="outline" onClick={handleSync}>
                                <RefreshIcon className="w-4 h-4 mr-2" />
                                Sincronizar Todos
                            </Button>
                        )}
                        {mayCreateEquip && (
                            <Button size="sm" onClick={openNew}>+ Novo Equipamento</Button>
                        )}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Descrição</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Marca</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Modelo</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">IP</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : equipamentos.length === 0 ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Nenhum equipamento encontrado.</td></tr>
                        ) : equipamentos.map((e) => (
                            <tr key={e.EQPCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{e.EQPDescricao || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{e.EQPMarca || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{e.EQPModelo || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{e.EQPEnderecoIp || "—"}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${e.EQPAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{e.EQPAtivo ? "Ativo" : "Inativo"}</span>
                                </td>
                                <td className="px-5 py-3">
                                    {mayUpdateEquip || mayDeleteEquip || (e.EQPMarca === "ControlID" && mayUpdateEquip) ? (
                                        <div className="flex flex-wrap gap-2">
                                            {mayUpdateEquip && (
                                                <button type="button" onClick={() => openEdit(e)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                            )}
                                            {e.EQPMarca === "ControlID" && mayUpdateEquip && (
                                                <a href={`/instituicao/${codigoInstituicao}/equipamentos/${e.EQPCodigo}/configuracao`} className="text-xs text-blue-500 hover:underline">Configurações</a>
                                            )}
                                            {mayDeleteEquip && (
                                                <button type="button" onClick={() => handleDeleteClick(e)} className="text-xs text-red-500 hover:underline">Excluir</button>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                    )}
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
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none"
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

            {/* Equipment Modal */}
            <Modal
                isOpen={equipmentModal.isOpen}
                onClose={equipmentModal.closeModal}
                className="modal-scroll-minimal max-h-[calc(100vh-100px)] max-w-lg overflow-y-auto p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {editing ? "Editar Equipamento" : "Novo Equipamento"}
                    </h3>
                    <div className="space-y-3">
                        <input placeholder="Descrição *" value={form.EQPDescricao} onChange={(e) => setForm({ ...form, EQPDescricao: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />

                        <div className="grid grid-cols-2 gap-3">
                            <select
                                value={form.EQPMarca}
                                onChange={(e) => setForm({ ...form, EQPMarca: e.target.value, EQPModelo: "" })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                            >
                                <option value="">Selecione a Marca</option>
                                <option value="ControlID">ControlID</option>
                                <option value="Hikvision">Hikvision</option>
                                <option value="Intelbras">Intelbras</option>
                                <option value="Outros">Outros</option>
                            </select>

                            <select
                                value={form.EQPModelo}
                                onChange={(e) => setForm({ ...form, EQPModelo: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                disabled={!form.EQPMarca}
                            >
                                <option value="">Selecione o Modelo</option>
                                {form.EQPMarca === 'ControlID' && CONTROLID_MODELS.map(m => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                                {form.EQPMarca === 'Hikvision' && (
                                    <>
                                        <option value="MinMoe">MinMoe</option>
                                        <option value="DS-K1T">DS-K1T Series</option>
                                    </>
                                )}
                                {form.EQPMarca === 'Intelbras' && (
                                    <>
                                        <option value="SS 311">SS 311</option>
                                        <option value="SS 411">SS 411</option>
                                    </>
                                )}
                                {form.EQPMarca === 'Outros' && (
                                    <option value="Generico">Genérico</option>
                                )}
                            </select>
                        </div>

                        {form.EQPMarca === 'ControlID' && form.EQPModelo && (
                            <div className="flex justify-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={CONTROLID_MODELS.find(m => m.value === form.EQPModelo)?.image}
                                    alt={form.EQPModelo}
                                    className="h-32 object-contain"
                                />
                            </div>
                        )}

                        <input placeholder="Endereço IP" value={form.EQPEnderecoIp} onChange={(e) => setForm({ ...form, EQPEnderecoIp: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />

                        {form.EQPMarca === 'ControlID' && (
                            <input
                                placeholder="Device ID (Monitor ControlID — equipamento)"
                                value={form.deviceId || ''}
                                onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                            />
                        )}

                        {/* ControlID Config Fields */}
                        {form.EQPMarca === 'ControlID' && (
                            <div className="pt-2 space-y-3 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-xs font-medium text-gray-500 uppercase">Configuração ControlID</p>
                                <input
                                    placeholder="Device ID (host principal / nuvem, EQPConfig)"
                                    value={(form as any).EQPConfig?.deviceId || ''}
                                    onChange={(e) => setForm({ ...form, EQPConfig: { ...(form.EQPConfig || {}), deviceId: e.target.value || undefined } })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Sentido de entrada (catraca)</label>
                                        <select
                                            value={(form as any).EQPConfig?.entry_side === 'left' ? 'left' : 'right'}
                                            onChange={(e) => {
                                                const side = e.target.value as 'left' | 'right';
                                                setForm({
                                                    ...form,
                                                    EQPConfig: {
                                                        ...(form.EQPConfig || {}),
                                                        entry_side: side,
                                                        entry_direction: side === 'left' ? 'counter_clockwise' : 'clockwise',
                                                    },
                                                });
                                            }}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                        >
                                            <option value="right">Direita</option>
                                            <option value="left">Esquerda</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1 flex flex-col justify-end">
                                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Sentido definido por</label>
                                        <select
                                            value={(form as any).EQPConfig?.entry_direction_applied_by_equipment ? 'equipment' : 'native'}
                                            onChange={(e) => setForm({
                                                ...form,
                                                EQPConfig: {
                                                    ...(form.EQPConfig || {}),
                                                    entry_direction_applied_by_equipment: e.target.value === 'equipment',
                                                },
                                            })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                        >
                                            <option value="native">Nativo da catraca (Monitor)</option>
                                            <option value="equipment">Instalação / equipamento</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input placeholder="Login (admin)" value={(form as any).EQPConfig?.user || ''}
                                        onChange={(e) => setForm({ ...form, EQPConfig: { ...(form.EQPConfig || {}), user: e.target.value } })}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                                    <div className="relative">
                                        <input
                                            placeholder="Senha"
                                            type={showPassword ? "text" : "password"}
                                            value={(form as any).EQPConfig?.pass || ''}
                                            onChange={(e) => setForm({ ...form, EQPConfig: { ...(form.EQPConfig || {}), pass: e.target.value } })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        >
                                            {showPassword ? <EyeCloseIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Special Fields for iDBlock Facial and Next (3 IPs) */}
                        {form.EQPMarca === 'ControlID' && (form.EQPModelo === 'iDBlock Facial' || form.EQPModelo === 'iDBlock Next') && (
                            <div className="pt-2 space-y-3 border-t border-gray-100 dark:border-gray-800">
                                <p className="text-xs font-medium text-gray-500 uppercase">Configuração iDFace (Entrada/Saída)</p>
                                <fieldset className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                    <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300 px-1">Entrada (entry)</legend>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input placeholder="IP iDFace Entrada" value={(form as any).EQPConfig?.ip_entry || ''}
                                            onChange={(e) => setForm({ ...form, EQPConfig: { ...(form.EQPConfig || {}), ip_entry: e.target.value } })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                                        <input placeholder="Device ID Monitor (entrada)" value={(form as any).EQPConfig?.deviceId_entry || ''}
                                            onChange={(e) => setForm({ ...form, EQPConfig: { ...(form.EQPConfig || {}), deviceId_entry: e.target.value || undefined } })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                                    </div>
                                </fieldset>
                                <fieldset className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                    <legend className="text-xs font-semibold text-gray-700 dark:text-gray-300 px-1">Saída (exit)</legend>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input placeholder="IP iDFace Saída" value={(form as any).EQPConfig?.ip_exit || ''}
                                            onChange={(e) => setForm({ ...form, EQPConfig: { ...(form.EQPConfig || {}), ip_exit: e.target.value } })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                                        <input placeholder="Device ID Monitor (saída)" value={(form as any).EQPConfig?.deviceId_exit || ''}
                                            onChange={(e) => setForm({ ...form, EQPConfig: { ...(form.EQPConfig || {}), deviceId_exit: e.target.value || undefined } })}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                                    </div>
                                </fieldset>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleTestConnection}
                                disabled={testStatus === "connecting"}
                            >
                                {testStatus === "connecting" ? "Testando..." : "Test Connection"}
                            </Button>
                            <span
                                title={
                                    testStatus === "success"
                                        ? "Conexão com sucesso"
                                        : testStatus === "error"
                                            ? testError || "Conexão falhou"
                                            : testStatus === "connecting"
                                                ? "Conexão em andamento..."
                                                : "Não conectado"
                                }
                                className={`inline-block w-3.5 h-3.5 shrink-0 rounded-full ${testStatus === "success"
                                        ? "bg-green-500"
                                        : testStatus === "error"
                                            ? "bg-red-500"
                                            : testStatus === "connecting"
                                                ? "test-chip-connecting"
                                                : "bg-orange-500"
                                    }`}
                            />
                            {testStatus === "error" && testError && (
                                <span className="max-w-[min(16rem,100%)] truncate text-xs text-red-500">
                                    {testError}
                                </span>
                            )}
                            {testStatus === "success" && (
                                <span className="text-xs text-green-600 dark:text-green-400">
                                    Conexão OK
                                </span>
                            )}
                        </div>
                        <div className="flex shrink-0 gap-3">
                            <Button size="sm" variant="outline" onClick={equipmentModal.closeModal}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal >


            {/* Deletion Modal */}
            < Modal
                isOpen={deleteModal.isOpen}
                onClose={deleteModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Confirmar Exclusão</h3>
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/10">
                        <div className="flex-shrink-0">
                            <AlertIcon className="h-6 w-6 text-red-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-red-800 dark:text-red-400">Atenção!</h4>
                            <p className="mt-1 text-sm text-red-700 dark:text-red-400/80">
                                Tem certeza que deseja excluir o equipamento <strong>{deleteTarget?.EQPDescricao}</strong>? Esta ação não pode ser desfeita.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={deleteModal.closeModal}>Cancelar</Button>
                        <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-transparent" onClick={confirmDelete} disabled={saving}>
                            {saving ? "Excluindo..." : "Sim, Excluir"}
                        </Button>
                    </div>
                </div>
            </Modal >
        </div >
    );
}
