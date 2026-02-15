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
    const { user, isGlobal } = useAuth();
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
                setAlert({ type: 'success', message: 'Instituição atualizada com sucesso.' });
            } else {
                await apiPost("/instituicoes", form);
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
                                <td className="px-5 py-3 flex gap-3">
                                    <button onClick={() => openEdit(i)} className="text-xs text-brand-500 hover:underline font-medium">Editar</button>
                                    {user?.grupo === 'SUPER_ROOT' && (
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

            {/* Modal Form */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900 space-y-4 shadow-xl border border-gray-200 dark:border-gray-800">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            {editing ? "Editar Instituição" : "Nova Instituição"}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                                <input
                                    placeholder="Nome da Instituição"
                                    value={form.INSNome}
                                    onChange={(e) => setForm({ ...form, INSNome: e.target.value })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
                                <select
                                    value={form.CLICodigo}
                                    onChange={(e) => setForm({ ...form, CLICodigo: parseInt(e.target.value) })}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                >
                                    <option value={0}>Selecione um Cliente</option>
                                    {clientes.map(c => <option key={c.CLICodigo} value={c.CLICodigo}>{c.CLINome}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end pt-2">
                            <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving || !form.INSNome || !form.CLICodigo}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmAction && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-800">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-2">
                            {confirmAction.type === 'delete' ? 'Confirmar Exclusão' :
                                confirmAction.active ? 'Ao inativar, nenhum usuário deste tenant poderá acessar o sistema.' : 'Confirmar Ativação'}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            {confirmAction.type === 'delete'
                                ? `Tem certeza que deseja excluir a instituição "${confirmAction.name}"? Esta ação não pode ser desfeita.`
                                : `Deseja realmente ${confirmAction.active ? 'inativar' : 'ativar'} a instituição "${confirmAction.name}"?`}
                        </p>
                        <div className="flex gap-3 justify-end">
                            <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>Cancelar</Button>
                            <Button
                                size="sm"
                                onClick={handleConfirmAction}
                                className={confirmAction.type === 'delete' || (confirmAction.type === 'toggle' && confirmAction.active) ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
                            >
                                Confirmar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
