"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/button/Button";

interface Acesso {
    UACCodigo: number;
    grupo: string;
    CLICodigo: number | null;
    INSInstituicaoCodigo: number | null;
    cliente?: { CLINome: string };
    instituicao?: { INSNome: string };
}

interface Usuario {
    USRCodigo: number;
    USRNome: string;
    USREmail: string;
    createdAt: string;
    acessos: Acesso[];
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

const GRUPO_LABELS: Record<string, string> = {
    SUPER_ROOT: "Super Root",
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    GESTOR: "Gestor",
    OPERACAO: "Operação",
};

const GRUPO_COLORS: Record<string, string> = {
    SUPER_ROOT: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    SUPER_ADMIN: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
    ADMIN: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    GESTOR: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    OPERACAO: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export default function UsuariosPage() {
    const { codigoInstituicao } = useTenant();
    const { user, isGlobal } = useAuth();
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Usuario | null>(null);
    const [form, setForm] = useState({ nome: "", email: "", senha: "" });
    const [saving, setSaving] = useState(false);

    // Acesso modal state
    const [showAcessoModal, setShowAcessoModal] = useState(false);
    const [acessoTarget, setAcessoTarget] = useState<Usuario | null>(null);
    const [acessoForm, setAcessoForm] = useState({ grupo: "OPERACAO", clienteId: "", instituicaoId: "" });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiGet<{ data: Usuario[]; meta: Meta }>(`/usuarios?page=${page}&limit=20`);
            let data = res.data || [];
            if (search) {
                const s = search.toLowerCase();
                data = data.filter((u) => u.USRNome?.toLowerCase().includes(s) || u.USREmail?.toLowerCase().includes(s));
            }
            setUsuarios(data);
            setMeta(res.meta);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [page, search]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing(null);
        setForm({ nome: "", email: "", senha: "" });
        setShowModal(true);
    };

    const openEdit = (u: Usuario) => {
        setEditing(u);
        setForm({ nome: u.USRNome, email: u.USREmail, senha: "" });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                const payload: any = { nome: form.nome, email: form.email };
                if (form.senha) payload.senha = form.senha;
                await apiPatch(`/usuarios/${editing.USRCodigo}`, payload);
            } else {
                await apiPost("/usuarios", form);
            }
            setShowModal(false);
            load();
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    const handleDelete = async (codigo: number) => {
        if (!confirm("Deseja realmente remover este usuário?")) return;
        await apiDelete(`/usuarios/${codigo}`);
        load();
    };

    const openAcessoModal = (u: Usuario) => {
        setAcessoTarget(u);
        setAcessoForm({ grupo: "OPERACAO", clienteId: "", instituicaoId: String(codigoInstituicao) });
        setShowAcessoModal(true);
    };

    const handleAddAcesso = async () => {
        if (!acessoTarget) return;
        setSaving(true);
        try {
            await apiPost(`/usuarios/${acessoTarget.USRCodigo}/acessos`, {
                grupo: acessoForm.grupo,
                clienteId: acessoForm.clienteId ? Number(acessoForm.clienteId) : undefined,
                instituicaoId: acessoForm.instituicaoId ? Number(acessoForm.instituicaoId) : undefined,
            });
            setShowAcessoModal(false);
            load();
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    const handleRemoveAcesso = async (acessoId: number) => {
        if (!confirm("Remover este acesso?")) return;
        await apiDelete(`/usuarios/acessos/${acessoId}`);
        load();
    };

    const availableGrupos = (() => {
        if (!user) return [];
        if (isGlobal) return ["ADMIN", "GESTOR", "OPERACAO"];
        const maxLevel = Math.max(
            ...user.acessos.map((a) => {
                const levels: Record<string, number> = { SUPER_ROOT: 5, SUPER_ADMIN: 4, ADMIN: 3, GESTOR: 2, OPERACAO: 1 };
                return levels[a.grupo] || 0;
            })
        );
        const all = [
            { key: "OPERACAO", level: 1 },
            { key: "GESTOR", level: 2 },
            { key: "ADMIN", level: 3 },
        ];
        return all.filter((g) => g.level < maxLevel).map((g) => g.key);
    })();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Usuários</h2>
                <Button size="sm" onClick={openNew}>+ Novo Usuário</Button>
            </div>

            <input
                type="text" placeholder="Buscar por nome ou email..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Email</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Acessos</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : usuarios.length === 0 ? (
                            <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Nenhum usuário encontrado.</td></tr>
                        ) : usuarios.map((u) => (
                            <tr key={u.USRCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{u.USRNome}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{u.USREmail}</td>
                                <td className="px-5 py-3">
                                    <div className="flex flex-wrap gap-1">
                                        {u.acessos.map((a) => (
                                            <span key={a.UACCodigo} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${GRUPO_COLORS[a.grupo] || ""}`}>
                                                {GRUPO_LABELS[a.grupo] || a.grupo}
                                                {a.instituicao && <span className="opacity-70">({a.instituicao.INSNome})</span>}
                                                <button onClick={() => handleRemoveAcesso(a.UACCodigo)} className="ml-1 text-red-400 hover:text-red-600" title="Remover acesso">&times;</button>
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-5 py-3 flex gap-2">
                                    <button onClick={() => openEdit(u)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                    <button onClick={() => openAcessoModal(u)} className="text-xs text-emerald-500 hover:underline">+ Acesso</button>
                                    <button onClick={() => handleDelete(u.USRCodigo)} className="text-xs text-red-500 hover:underline">Remover</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Página {meta.page} de {meta.totalPages}</p>
                    <div className="flex gap-2">
                        <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                        <Button size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
                    </div>
                </div>
            )}

            {/* User Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            {editing ? "Editar Usuário" : "Novo Usuário"}
                        </h3>
                        <div className="space-y-3">
                            <input placeholder="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder={editing ? "Nova Senha (opcional)" : "Senha *"} type="password" value={form.senha}
                                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving || !form.nome || !form.email || (!editing && !form.senha)}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Acesso Modal */}
            {showAcessoModal && acessoTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            Adicionar Acesso — {acessoTarget.USRNome}
                        </h3>
                        <div className="space-y-3">
                            <label className="block text-sm text-gray-600 dark:text-gray-400">
                                Papel
                                <select value={acessoForm.grupo} onChange={(e) => setAcessoForm({ ...acessoForm, grupo: e.target.value })}
                                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                                    {availableGrupos.map((g) => (
                                        <option key={g} value={g}>{GRUPO_LABELS[g] || g}</option>
                                    ))}
                                </select>
                            </label>
                            <input placeholder="Cód. Cliente (opcional)" value={acessoForm.clienteId}
                                onChange={(e) => setAcessoForm({ ...acessoForm, clienteId: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Cód. Instituição (opcional)" value={acessoForm.instituicaoId}
                                onChange={(e) => setAcessoForm({ ...acessoForm, instituicaoId: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button size="sm" onClick={() => setShowAcessoModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleAddAcesso} disabled={saving}>
                                {saving ? "Salvando..." : "Adicionar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
