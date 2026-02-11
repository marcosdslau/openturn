"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";

interface Instituicao {
    INSCodigo: number;
    INSNome: string;
    CLICodigo: number;
    INSAtivo: boolean;
    cliente?: { CLINome: string };
}

interface Cliente {
    CLICodigo: number;
    CLINome: string;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

export default function InstituicoesGlobalPage() {
    const { isGlobal } = useAuth();
    const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Instituicao | null>(null);
    const [form, setForm] = useState({ INSNome: "", CLICodigo: 0 });
    const [saving, setSaving] = useState(false);

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

    const openNew = () => {
        setEditing(null);
        setForm({ INSNome: "", CLICodigo: clientes[0]?.CLICodigo || 0 });
        setShowModal(true);
    };

    const openEdit = (i: Instituicao) => {
        setEditing(i);
        setForm({ INSNome: i.INSNome, CLICodigo: i.CLICodigo });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/instituicoes/${editing.INSCodigo}`, form);
            } else {
                await apiPost("/instituicoes", form);
            }
            setShowModal(false);
            load();
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    const handleDelete = async (codigo: number) => {
        if (!confirm("Deseja realmente excluir esta instituição?")) return;
        await apiDelete(`/instituicoes/${codigo}`);
        load();
    };

    if (!isGlobal) return <div className="p-6">Acesso negado.</div>;

    return (
        <div className="space-y-6">
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
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${i.INSAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{i.INSAtivo ? "Ativo" : "Inativo"}</span>
                                </td>
                                <td className="px-5 py-3 flex gap-2">
                                    <button onClick={() => openEdit(i)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                    <button onClick={() => handleDelete(i.INSCodigo)} className="text-xs text-red-500 hover:underline">Excluir</button>
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
                            {editing ? "Editar Instituição" : "Nova Instituição"}
                        </h3>
                        <div className="space-y-3">
                            <input placeholder="Nome *" value={form.INSNome} onChange={(e) => setForm({ ...form, INSNome: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <select value={form.CLICodigo} onChange={(e) => setForm({ ...form, CLICodigo: parseInt(e.target.value) })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                                <option value={0}>Selecione um Cliente</option>
                                {clientes.map(c => <option key={c.CLICodigo} value={c.CLICodigo}>{c.CLINome}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving || !form.INSNome || !form.CLICodigo}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
