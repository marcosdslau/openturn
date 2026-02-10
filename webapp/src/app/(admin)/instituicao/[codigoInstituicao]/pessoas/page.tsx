"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";

interface Pessoa {
    PESCodigo: number;
    PESNome: string;
    PESNomeSocial: string | null;
    PESDocumento: string | null;
    PESEmail: string | null;
    PESTelefone: string | null;
    PESCelular: string | null;
    PESCartaoTag: string | null;
    PESAtivo: boolean;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

export default function PessoasPage() {
    const { codigoInstituicao } = useTenant();
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Pessoa | null>(null);
    const [form, setForm] = useState({ PESNome: "", PESDocumento: "", PESEmail: "", PESCelular: "", PESCartaoTag: "" });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiGet<{ data: Pessoa[]; meta: Meta }>(`/pessoas?page=${page}&limit=20`);
            let data = res.data || [];
            if (search) {
                const s = search.toLowerCase();
                data = data.filter((p) => p.PESNome?.toLowerCase().includes(s) || p.PESDocumento?.toLowerCase().includes(s));
            }
            setPessoas(data);
            setMeta(res.meta);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [codigoInstituicao, page, search]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing(null);
        setForm({ PESNome: "", PESDocumento: "", PESEmail: "", PESCelular: "", PESCartaoTag: "" });
        setShowModal(true);
    };

    const openEdit = (p: Pessoa) => {
        setEditing(p);
        setForm({
            PESNome: p.PESNome, PESDocumento: p.PESDocumento || "",
            PESEmail: p.PESEmail || "", PESCelular: p.PESCelular || "",
            PESCartaoTag: p.PESCartaoTag || "",
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/pessoas/${editing.PESCodigo}`, form);
            } else {
                await apiPost("/pessoas", { ...form, INSInstituicaoCodigo: codigoInstituicao });
            }
            setShowModal(false);
            load();
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    const handleDelete = async (codigo: number) => {
        if (!confirm("Deseja realmente desativar esta pessoa?")) return;
        await apiDelete(`/pessoas/${codigo}`);
        load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Pessoas</h2>
                <Button size="sm" onClick={openNew}>+ Nova Pessoa</Button>
            </div>

            {/* Search */}
            <input
                type="text" placeholder="Buscar por nome ou documento..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Documento</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Email</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Tag</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : pessoas.length === 0 ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Nenhuma pessoa encontrada.</td></tr>
                        ) : pessoas.map((p) => (
                            <tr key={p.PESCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{p.PESNome}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.PESDocumento || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.PESEmail || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.PESCartaoTag || "—"}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.PESAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{p.PESAtivo ? "Ativo" : "Inativo"}</span>
                                </td>
                                <td className="px-5 py-3 flex gap-2">
                                    <button onClick={() => openEdit(p)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                    <button onClick={() => handleDelete(p.PESCodigo)} className="text-xs text-red-500 hover:underline">Desativar</button>
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
                            {editing ? "Editar Pessoa" : "Nova Pessoa"}
                        </h3>
                        <div className="space-y-3">
                            <input placeholder="Nome *" value={form.PESNome} onChange={(e) => setForm({ ...form, PESNome: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Documento (CPF)" value={form.PESDocumento} onChange={(e) => setForm({ ...form, PESDocumento: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Email" value={form.PESEmail} onChange={(e) => setForm({ ...form, PESEmail: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Celular" value={form.PESCelular} onChange={(e) => setForm({ ...form, PESCelular: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Cartão/Tag" value={form.PESCartaoTag} onChange={(e) => setForm({ ...form, PESCartaoTag: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving || !form.PESNome}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
