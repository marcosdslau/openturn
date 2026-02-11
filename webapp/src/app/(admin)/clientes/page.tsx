"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";

interface Cliente {
    CLICodigo: number;
    CLINome: string;
    CLIDocumento: string | null;
    CLIAtivo: boolean;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

export default function ClientesPage() {
    const { isGlobal } = useAuth();
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [search, setSearch] = useState("");

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Cliente | null>(null);
    const [form, setForm] = useState({ CLINome: "", CLIDocumento: "" });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!isGlobal) return;
        setLoading(true);
        try {
            const res = await apiGet<{ data: Cliente[]; meta: Meta }>(`/clientes?page=${page}&limit=${limit}`);
            let data = res.data || [];
            if (search) {
                const s = search.toLowerCase();
                data = data.filter((p) => p.CLINome?.toLowerCase().includes(s) || p.CLIDocumento?.toLowerCase().includes(s));
            }
            setClientes(data);
            setMeta(res.meta);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [isGlobal, page, limit, search]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing(null);
        setForm({ CLINome: "", CLIDocumento: "" });
        setShowModal(true);
    };

    const openEdit = (c: Cliente) => {
        setEditing(c);
        setForm({ CLINome: c.CLINome, CLIDocumento: c.CLIDocumento || "" });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/clientes/${editing.CLICodigo}`, form);
            } else {
                await apiPost("/clientes", form);
            }
            setShowModal(false);
            load();
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    const handleDelete = async (codigo: number) => {
        if (!confirm("Deseja realmente excluir este cliente?")) return;
        await apiDelete(`/clientes/${codigo}`);
        load();
    };

    if (!isGlobal) return <div className="p-6">Acesso negado.</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Clientes</h2>
                <Button size="sm" onClick={openNew}>+ Novo Cliente</Button>
            </div>

            <input
                type="text" placeholder="Buscar por nome ou documento..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">ID</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Documento</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : clientes.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhum cliente encontrado.</td></tr>
                        ) : clientes.map((c) => (
                            <tr key={c.CLICodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{c.CLICodigo}</td>
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{c.CLINome}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{c.CLIDocumento || "—"}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.CLIAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{c.CLIAtivo ? "Ativo" : "Inativo"}</span>
                                </td>
                                <td className="px-5 py-3 flex gap-2">
                                    <button onClick={() => openEdit(c)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                    <button onClick={() => handleDelete(c.CLICodigo)} className="text-xs text-red-500 hover:underline">Excluir</button>
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

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            {editing ? "Editar Cliente" : "Novo Cliente"}
                        </h3>
                        <div className="space-y-3">
                            <input placeholder="Nome *" value={form.CLINome} onChange={(e) => setForm({ ...form, CLINome: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Documento (CNPJ/CPF)" value={form.CLIDocumento} onChange={(e) => setForm({ ...form, CLIDocumento: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving || !form.CLINome}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
