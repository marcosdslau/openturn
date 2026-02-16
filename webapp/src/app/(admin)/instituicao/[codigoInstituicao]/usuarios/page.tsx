"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { useToast } from "@/context/ToastContext";
import { AlertIcon, TrashBinIcon } from "@/icons";

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
    const { showToast } = useToast();
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    // Modals
    const userModal = useModal();
    const acessoModal = useModal();
    const deleteUserModal = useModal();
    const removeAcessoModal = useModal();

    const [editing, setEditing] = useState<Usuario | null>(null);
    const [form, setForm] = useState({ nome: "", email: "", senha: "" });
    const [saving, setSaving] = useState(false);

    const [acessoTarget, setAcessoTarget] = useState<Usuario | null>(null);
    const [acessoForm, setAcessoForm] = useState({ grupo: "OPERACAO", clienteId: "", instituicaoId: "" });

    const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
    const [removeAcessoTarget, setRemoveAcessoTarget] = useState<{ id: number; usuario: string } | null>(null);

    // Client/Institution lists for selects
    const [allClientes, setAllClientes] = useState<{ id: number; nome: string }[]>([]);
    const [allInstituicoes, setAllInstituicoes] = useState<{ id: number; nome: string; clienteId: number }[]>([]);

    useEffect(() => {
        if (isGlobal) {
            // Fetch all for global users
            Promise.all([
                apiGet<{ data: any[] }>("/clientes?limit=100"),
                apiGet<{ data: any[] }>("/instituicoes?limit=100")
            ]).then(([clientesRes, instRes]) => {
                setAllClientes(clientesRes.data.map(c => ({ id: c.CLICodigo, nome: c.CLINome })));
                setAllInstituicoes(instRes.data.map(i => ({ id: i.INSCodigo, nome: i.INSNome, clienteId: i.CLICodigo })));
            }).catch(() => { /* ignore */ });
        } else if (user) {
            // For scoped users, extract from their own acessos
            const clis = new Map<number, string>();
            const insts: { id: number; nome: string; clienteId: number }[] = [];

            user.acessos.forEach(a => {
                if (a.clienteId && a.clienteNome) clis.set(a.clienteId, a.clienteNome);
                if (a.instituicaoId && a.instituicaoNome && a.clienteId) {
                    insts.push({ id: a.instituicaoId, nome: a.instituicaoNome, clienteId: a.clienteId });
                }
            });

            setAllClientes(Array.from(clis.entries()).map(([id, nome]) => ({ id, nome })));
            setAllInstituicoes(insts);
        }
    }, [isGlobal, user]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiGet<{ data: Usuario[]; meta: Meta }>(`/instituicao/${codigoInstituicao}/usuario?page=${page}&limit=20`);
            let data = res.data || [];
            if (search) {
                const s = search.toLowerCase();
                data = data.filter((u) => u.USRNome?.toLowerCase().includes(s) || u.USREmail?.toLowerCase().includes(s));
            }
            setUsuarios(data);
            setMeta(res.meta);
        } catch (error: any) {
            showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar os usuários.");
        } finally { setLoading(false); }
    }, [codigoInstituicao, page, search, showToast]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing(null);
        setForm({ nome: "", email: "", senha: "" });
        userModal.openModal();
    };

    const openEdit = (u: Usuario) => {
        setEditing(u);
        setForm({ nome: u.USRNome, email: u.USREmail, senha: "" });
        userModal.openModal();
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                const payload: any = { nome: form.nome, email: form.email };
                if (form.senha) payload.senha = form.senha;
                await apiPatch(`/instituicao/${codigoInstituicao}/usuario/${editing.USRCodigo}`, payload);
                showToast("success", "Usuário atualizado", "Os dados foram salvos com sucesso.");
            } else {
                await apiPost(`/instituicao/${codigoInstituicao}/usuario`, form);
                showToast("success", "Usuário criado", "O novo usuário foi cadastrado com sucesso.");
            }
            userModal.closeModal();
            load();
        } catch (error: any) {
            showToast("error", "Erro ao salvar", error.message || "Ocorreu um erro ao processar a solicitação.");
        } finally { setSaving(false); }
    };

    const handleDeleteClick = (u: Usuario) => {
        setDeleteTarget(u);
        deleteUserModal.openModal();
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await apiDelete(`/instituicao/${codigoInstituicao}/usuario/${deleteTarget.USRCodigo}`);
            showToast("success", "Usuário removido", "O usuário foi excluído com sucesso.");
            deleteUserModal.closeModal();
            load();
        } catch (error: any) {
            showToast("error", "Erro ao excluir", error.message || "Não foi possível remover o usuário.");
        } finally { setSaving(false); }
    };

    const openAcessoModal = (u: Usuario) => {
        setAcessoTarget(u);
        // Default to current selection if possible
        setAcessoForm({
            grupo: "OPERACAO",
            clienteId: String(allClientes[0]?.id || ""),
            instituicaoId: String(codigoInstituicao || allInstituicoes.find(i => i.clienteId === allClientes[0]?.id)?.id || "")
        });
        acessoModal.openModal();
    };

    const handleAddAcesso = async () => {
        if (!acessoTarget) return;
        setSaving(true);
        try {
            await apiPost(`/instituicao/${codigoInstituicao}/usuario/${acessoTarget.USRCodigo}/acessos`, {
                grupo: acessoForm.grupo,
                clienteId: acessoForm.clienteId ? Number(acessoForm.clienteId) : undefined,
                instituicaoId: acessoForm.instituicaoId ? Number(acessoForm.instituicaoId) : undefined,
            });
            showToast("success", "Acesso adicionado", "O novo acesso foi vinculado ao usuário.");
            acessoModal.closeModal();
            load();
        } catch (error: any) {
            showToast("error", "Erro ao adicionar acesso", error.message || "Não foi possível vincular o acesso.");
        } finally { setSaving(false); }
    };

    const handleRemoveAcessoClick = (acessoId: number, usuarioNome: string) => {
        setRemoveAcessoTarget({ id: acessoId, usuario: usuarioNome });
        removeAcessoModal.openModal();
    };

    const confirmRemoveAcesso = async () => {
        if (!removeAcessoTarget) return;
        setSaving(true);
        try {
            await apiDelete(`/instituicao/${codigoInstituicao}/usuario/acessos/${removeAcessoTarget.id}`);
            showToast("success", "Acesso removido", "O acesso foi revogado com sucesso.");
            removeAcessoModal.closeModal();
            load();
        } catch (error: any) {
            showToast("error", "Erro ao remover acesso", error.message || "Não foi possível revogar o acesso.");
        } finally { setSaving(false); }
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

    const filteredInstituicoes = allInstituicoes.filter(i => !acessoForm.clienteId || i.clienteId === Number(acessoForm.clienteId));

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
                                                <button onClick={() => handleRemoveAcessoClick(a.UACCodigo, u.USRNome)} className="ml-1 text-red-400 hover:text-red-600" title="Remover acesso">&times;</button>
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-5 py-3 flex gap-2">
                                    <button onClick={() => openEdit(u)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                    <button onClick={() => openAcessoModal(u)} className="text-xs text-emerald-500 hover:underline">+ Acesso</button>
                                    <button onClick={() => handleDeleteClick(u)} className="text-xs text-red-500 hover:underline">Remover</button>
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
            <Modal
                isOpen={userModal.isOpen}
                onClose={userModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        {editing ? "Editar Usuário" : "Novo Usuário"}
                    </h3>
                    <div className="space-y-3">
                        <input placeholder="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder={editing ? "Nova Senha (opcional)" : "Senha *"} type="password" value={form.senha}
                            onChange={(e) => setForm({ ...form, senha: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={userModal.closeModal}>Cancelar</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !form.nome || !form.email || (!editing && !form.senha)}>
                            {saving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Acesso Modal */}
            <Modal
                isOpen={acessoModal.isOpen}
                onClose={acessoModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Adicionar Acesso — {acessoTarget?.USRNome || ""}
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400">Papel</label>
                            <select value={acessoForm.grupo} onChange={(e) => setAcessoForm({ ...acessoForm, grupo: e.target.value })}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none">
                                {availableGrupos.map((g) => (
                                    <option key={g} value={g}>{GRUPO_LABELS[g] || g}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400">Cliente</label>
                            <select value={acessoForm.clienteId}
                                onChange={(e) => {
                                    const cid = e.target.value;
                                    const firstInst = allInstituicoes.find(i => i.clienteId === Number(cid));
                                    setAcessoForm({ ...acessoForm, clienteId: cid, instituicaoId: firstInst ? String(firstInst.id) : "" });
                                }}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none">
                                <option value="">Selecione um Cliente</option>
                                {allClientes.map(c => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400">Instituição</label>
                            <select value={acessoForm.instituicaoId}
                                onChange={(e) => setAcessoForm({ ...acessoForm, instituicaoId: e.target.value })}
                                disabled={!acessoForm.clienteId}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white disabled:opacity-50 focus:border-brand-500 focus:outline-none">
                                <option value="">Selecione uma Instituição</option>
                                {filteredInstituicoes.map(i => (
                                    <option key={i.id} value={i.id}>{i.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={acessoModal.closeModal}>Cancelar</Button>
                        <Button size="sm" onClick={handleAddAcesso} disabled={saving || !acessoForm.clienteId}>
                            {saving ? "Salvando..." : "Adicionar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Confirmation Modals */}
            <Modal
                isOpen={deleteUserModal.isOpen}
                onClose={deleteUserModal.closeModal}
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
                                Tem certeza que deseja remover o usuário <strong>{deleteTarget?.USRNome}</strong>? Esta ação não pode ser desfeita.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <Button size="sm" variant="outline" onClick={deleteUserModal.closeModal}>Cancelar</Button>
                        <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-transparent" onClick={confirmDelete} disabled={saving}>
                            {saving ? "Removendo..." : "Sim, Remover Usuário"}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={removeAcessoModal.isOpen}
                onClose={removeAcessoModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Revogar Acesso</h3>
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10">
                        <div className="flex-shrink-0">
                            <AlertIcon className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Confirmar Remoção</h4>
                            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400/80">
                                Deseja remover este acesso de <strong>{removeAcessoTarget?.usuario}</strong>?
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <Button size="sm" variant="outline" onClick={removeAcessoModal.closeModal}>Cancelar</Button>
                        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white border-transparent" onClick={confirmRemoveAcesso} disabled={saving}>
                            {saving ? "Revogando..." : "Confirmar Remoção"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
