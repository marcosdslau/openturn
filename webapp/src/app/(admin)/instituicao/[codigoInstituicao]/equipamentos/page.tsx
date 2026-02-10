"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";

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
    const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Equipamento | null>(null);
    const [form, setForm] = useState({ EQPDescricao: "", EQPMarca: "", EQPModelo: "", EQPEnderecoIp: "" });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiGet<{ data: Equipamento[]; meta: Meta }>(`/equipamentos?page=${page}&limit=20`);
            setEquipamentos(res.data || []);
            setMeta(res.meta);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [codigoInstituicao, page]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing(null);
        setForm({ EQPDescricao: "", EQPMarca: "", EQPModelo: "", EQPEnderecoIp: "" });
        setShowModal(true);
    };

    const openEdit = (e: Equipamento) => {
        setEditing(e);
        setForm({
            EQPDescricao: e.EQPDescricao || "", EQPMarca: e.EQPMarca || "",
            EQPModelo: e.EQPModelo || "", EQPEnderecoIp: e.EQPEnderecoIp || "",
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/equipamentos/${editing.EQPCodigo}`, form);
            } else {
                await apiPost("/equipamentos", { ...form, INSInstituicaoCodigo: codigoInstituicao });
            }
            setShowModal(false);
            load();
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    const handleDelete = async (codigo: number) => {
        if (!confirm("Deseja realmente excluir este equipamento?")) return;
        await apiDelete(`/equipamentos/${codigo}`);
        load();
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
                                    <button onClick={() => handleDelete(e.EQPCodigo)} className="text-xs text-red-500 hover:underline">Excluir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Página {meta.page} de {meta.totalPages}</p>
                    <div className="flex gap-2">
                        <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                        <Button size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            {editing ? "Editar Equipamento" : "Novo Equipamento"}
                        </h3>
                        <div className="space-y-3">
                            <input placeholder="Descrição *" value={form.EQPDescricao} onChange={(e) => setForm({ ...form, EQPDescricao: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Marca" value={form.EQPMarca} onChange={(e) => setForm({ ...form, EQPMarca: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Modelo" value={form.EQPModelo} onChange={(e) => setForm({ ...form, EQPModelo: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Endereço IP" value={form.EQPEnderecoIp} onChange={(e) => setForm({ ...form, EQPEnderecoIp: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
