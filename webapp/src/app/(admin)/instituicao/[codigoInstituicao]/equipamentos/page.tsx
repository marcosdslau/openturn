"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { useToast } from "@/context/ToastContext";
import { AlertIcon } from "@/icons";

interface Equipamento {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
    EQPEnderecoIp: string | null;
    EQPAtivo: boolean;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

export default function EquipamentosPage() {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();
    const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    // Modals
    const equipmentModal = useModal();
    const deleteModal = useModal();

    const [editing, setEditing] = useState<Equipamento | null>(null);
    const [form, setForm] = useState({ EQPDescricao: "", EQPMarca: "", EQPModelo: "", EQPEnderecoIp: "" });
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Equipamento | null>(null);

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
        setForm({ EQPDescricao: "", EQPMarca: "", EQPModelo: "", EQPEnderecoIp: "" });
        equipmentModal.openModal();
    };

    const openEdit = (e: Equipamento) => {
        setEditing(e);
        setForm({
            EQPDescricao: e.EQPDescricao || "", EQPMarca: e.EQPMarca || "",
            EQPModelo: e.EQPModelo || "", EQPEnderecoIp: e.EQPEnderecoIp || "",
        });
        equipmentModal.openModal();
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Equipamentos</h2>
                <Button size="sm" onClick={openNew}>+ Novo Equipamento</Button>
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
                                <td className="px-5 py-3 flex gap-2">
                                    <button onClick={() => openEdit(e)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                    <button onClick={() => handleDeleteClick(e)} className="text-xs text-red-500 hover:underline">Excluir</button>
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
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {editing ? "Editar Equipamento" : "Novo Equipamento"}
                    </h3>
                    <div className="space-y-3">
                        <input placeholder="Descrição *" value={form.EQPDescricao} onChange={(e) => setForm({ ...form, EQPDescricao: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Marca" value={form.EQPMarca} onChange={(e) => setForm({ ...form, EQPMarca: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Modelo" value={form.EQPModelo} onChange={(e) => setForm({ ...form, EQPModelo: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Endereço IP" value={form.EQPEnderecoIp} onChange={(e) => setForm({ ...form, EQPEnderecoIp: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={equipmentModal.closeModal}>Cancelar</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Deletion Modal */}
            <Modal
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
            </Modal>
        </div>
    );
}
