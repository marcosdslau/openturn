"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import Alert from "@/components/ui/alert/Alert";
import Button from "@/components/ui/button/Button";

interface AdminUser {
    USRCodigo: number;
    USRNome: string;
    USREmail: string;
    USRAtivo: boolean;
    createdAt: string;
    acessos: { UACCodigo: number; grupo: string }[];
}

interface Instituicao {
    INSCodigo: number;
    INSNome: string;
    INSAtivo: boolean;
    CLICodigo: number;
    cliente?: { CLINome: string };
}

interface ToastItem {
    id: number;
    variant: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
}

const GRUPO_LABELS: Record<string, string> = {
    SUPER_ROOT: "Super Root",
    SUPER_ADMIN: "Super Admin",
};

const GRUPO_COLORS: Record<string, string> = {
    SUPER_ROOT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    SUPER_ADMIN: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

type ActiveTab = "usuarios" | "instituicoes";
type FormModalType = "create" | "edit" | "password" | null;

// ════════════════════════════════════════════════════════════
// Toast Hook
// ════════════════════════════════════════════════════════════
function useToast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const nextId = useRef(0);

    const show = useCallback((variant: ToastItem["variant"], title: string, message: string) => {
        const id = nextId.current++;
        setToasts((prev) => [...prev, { id, variant, title, message }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return { toasts, show, dismiss };
}

// ════════════════════════════════════════════════════════════
// Toast Container (top-right, fixed)
// ════════════════════════════════════════════════════════════
function ToastContainer({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
    if (toasts.length === 0) return null;
    return (
        <div className="fixed top-5 right-5 z-[999999] flex flex-col gap-3 w-[380px] max-w-[calc(100vw-2rem)]">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className="animate-slide-in-right cursor-pointer shadow-lg rounded-xl"
                    onClick={() => dismiss(t.id)}
                >
                    <Alert variant={t.variant} title={t.title} message={t.message} />
                </div>
            ))}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Main Settings Page
// ════════════════════════════════════════════════════════════
export default function SettingsPage() {
    const { isSuperRoot, isAdmin, loading: authLoading } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<ActiveTab>("usuarios");

    useEffect(() => {
        if (!authLoading && !isSuperRoot && !isAdmin) {
            router.push("/");
        }
    }, [authLoading, isSuperRoot, isAdmin, router]);

    if (authLoading || (!isSuperRoot && !isAdmin)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-pulse text-gray-400 text-sm">Carregando...</div>
            </div>
        );
    }

    const tabs: { key: ActiveTab; label: string }[] = [
        { key: "usuarios", label: "Usuários" },
        { key: "instituicoes", label: "Instituições" },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Configurações
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Administração de usuários e instituições do sistema
                </p>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex gap-6">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`
                                py-3 px-1 text-sm font-medium border-b-2 transition-colors
                                ${activeTab === tab.key
                                    ? "border-brand-500 text-brand-600 dark:text-brand-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200"
                                }
                            `}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {activeTab === "usuarios" && <UsersTab isSuperRoot={isSuperRoot} />}
            {activeTab === "instituicoes" && <InstitutionsTab />}
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Users Tab
// ════════════════════════════════════════════════════════════
function UsersTab({ isSuperRoot }: { isSuperRoot: boolean }) {
    const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Form modal state
    const [formModalType, setFormModalType] = useState<FormModalType>(null);
    const [target, setTarget] = useState<AdminUser | null>(null);
    const [form, setForm] = useState({ nome: "", email: "", senha: "", grupo: "SUPER_ADMIN" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // Confirmation modal
    const confirmModal = useModal();
    const [confirmAction, setConfirmAction] = useState<{ type: "toggle" | "delete"; user: AdminUser } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Toast
    const toast = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const searchParam = search ? `?search=${encodeURIComponent(search)}` : "";
            const data = await apiGet<AdminUser[]>(`/admin-usuarios${searchParam}`);
            setUsuarios(data);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [search]);

    useEffect(() => { load(); }, [load]);

    // ─── Form modal openers ───
    const openCreate = () => {
        setTarget(null);
        setForm({ nome: "", email: "", senha: "", grupo: "SUPER_ADMIN" });
        setError("");
        setFormModalType("create");
    };

    const openEdit = (u: AdminUser) => {
        setTarget(u);
        setForm({ nome: u.USRNome, email: u.USREmail, senha: "", grupo: "" });
        setError("");
        setFormModalType("edit");
    };

    const openPassword = (u: AdminUser) => {
        setTarget(u);
        setForm({ nome: "", email: "", senha: "", grupo: "" });
        setError("");
        setFormModalType("password");
    };

    // ─── Form handlers ───
    const handleCreate = async () => {
        setSaving(true);
        setError("");
        try {
            await apiPost("/admin-usuarios", {
                nome: form.nome,
                email: form.email,
                senha: form.senha,
                grupo: form.grupo,
            });
            setFormModalType(null);
            toast.show("success", "Usuário criado", `O usuário "${form.nome}" foi criado com sucesso.`);
            load();
        } catch (e: any) {
            setError(e?.message || "Erro ao criar usuário");
        } finally { setSaving(false); }
    };

    const handleEdit = async () => {
        if (!target) return;
        setSaving(true);
        setError("");
        try {
            await apiPatch(`/admin-usuarios/${target.USRCodigo}`, {
                nome: form.nome,
                email: form.email,
            });
            setFormModalType(null);
            toast.show("success", "Usuário atualizado", `Os dados de "${form.nome}" foram atualizados.`);
            load();
        } catch (e: any) {
            setError(e?.message || "Erro ao atualizar");
        } finally { setSaving(false); }
    };

    const handleResetPassword = async () => {
        if (!target) return;
        setSaving(true);
        setError("");
        try {
            await apiPatch(`/admin-usuarios/${target.USRCodigo}/senha`, {
                newPassword: form.senha,
            });
            setFormModalType(null);
            toast.show("success", "Senha alterada", `A senha de "${target.USRNome}" foi alterada com sucesso.`);
        } catch (e: any) {
            setError(e?.message || "Erro ao alterar senha");
        } finally { setSaving(false); }
    };

    // ─── Confirmation modal openers ───
    const askToggleActive = (u: AdminUser) => {
        setConfirmAction({ type: "toggle", user: u });
        confirmModal.openModal();
    };

    const askDelete = (u: AdminUser) => {
        setConfirmAction({ type: "delete", user: u });
        confirmModal.openModal();
    };

    const handleConfirm = async () => {
        if (!confirmAction) return;
        setConfirmLoading(true);
        try {
            if (confirmAction.type === "toggle") {
                await apiPatch(`/admin-usuarios/${confirmAction.user.USRCodigo}/inativar`, {});
                const verb = confirmAction.user.USRAtivo ? "inativado" : "ativado";
                toast.show("success", `Usuário ${verb}`, `"${confirmAction.user.USRNome}" foi ${verb} com sucesso.`);
            } else {
                await apiDelete(`/admin-usuarios/${confirmAction.user.USRCodigo}`);
                toast.show("success", "Usuário excluído", `"${confirmAction.user.USRNome}" foi excluído permanentemente.`);
            }
            load();
        } catch {
            toast.show("error", "Erro", "Não foi possível concluir a operação.");
        } finally {
            setConfirmLoading(false);
            confirmModal.closeModal();
            setConfirmAction(null);
        }
    };

    const availableGrupos = isSuperRoot
        ? [{ key: "SUPER_ROOT", label: "Super Root" }, { key: "SUPER_ADMIN", label: "Super Admin" }]
        : [{ key: "SUPER_ADMIN", label: "Super Admin" }];

    // ─── Confirmation modal content vars ───
    const isDelete = confirmAction?.type === "delete";
    const confirmTitle = isDelete ? "Excluir Usuário" : (confirmAction?.user.USRAtivo ? "Inativar Usuário" : "Ativar Usuário");
    const confirmMessage = isDelete
        ? `Tem certeza que deseja excluir permanentemente o usuário "${confirmAction?.user.USRNome}"? Esta ação não pode ser desfeita.`
        : `Tem certeza que deseja ${confirmAction?.user.USRAtivo ? "inativar" : "ativar"} o usuário "${confirmAction?.user.USRNome}"?`;

    return (
        <div className="space-y-4">
            {/* Toast */}
            <ToastContainer toasts={toast.toasts} dismiss={toast.dismiss} />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <input
                    type="text"
                    placeholder="Buscar por nome ou email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <Button size="sm" onClick={openCreate}>
                    + Novo Usuário
                </Button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Email</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Perfil</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : usuarios.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhum usuário encontrado.</td></tr>
                        ) : usuarios.map((u) => (
                            <tr key={u.USRCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90 font-medium">{u.USRNome}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{u.USREmail}</td>
                                <td className="px-5 py-3">
                                    <div className="flex flex-wrap gap-1">
                                        {u.acessos.map((a) => (
                                            <span key={a.UACCodigo} className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${GRUPO_COLORS[a.grupo] || ""}`}>
                                                {GRUPO_LABELS[a.grupo] || a.grupo}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.USRAtivo
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
                                        }`}>
                                        {u.USRAtivo ? "Ativo" : "Inativo"}
                                    </span>
                                </td>
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button onClick={() => openEdit(u)} className="text-xs text-brand-500 hover:text-brand-700 hover:underline font-medium">Editar</button>
                                        <button onClick={() => openPassword(u)} className="text-xs text-blue-500 hover:text-blue-700 hover:underline font-medium">Senha</button>
                                        <button onClick={() => askToggleActive(u)} className={`text-xs hover:underline font-medium ${u.USRAtivo ? "text-amber-500 hover:text-amber-700" : "text-emerald-500 hover:text-emerald-700"}`}>
                                            {u.USRAtivo ? "Inativar" : "Ativar"}
                                        </button>
                                        <button onClick={() => askDelete(u)} className="text-xs text-red-500 hover:text-red-700 hover:underline font-medium">Excluir</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ─── Create Modal (TailAdmin Modal) ─── */}
            <Modal isOpen={formModalType === "create"} onClose={() => setFormModalType(null)} className="max-w-[500px] p-6 lg:p-8">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">Novo Usuário</h3>
                <div className="space-y-3">
                    <InputField label="Nome *" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
                    <InputField label="Email *" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                    <InputField label="Senha *" type="password" value={form.senha} onChange={(v) => setForm({ ...form, senha: v })} />
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Perfil *</label>
                        <select
                            value={form.grupo}
                            onChange={(e) => setForm({ ...form, grupo: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        >
                            {availableGrupos.map((g) => (
                                <option key={g.key} value={g.key}>{g.label}</option>
                            ))}
                        </select>
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
                <div className="flex gap-3 justify-end pt-4">
                    <Button size="sm" variant="outline" onClick={() => setFormModalType(null)}>Cancelar</Button>
                    <Button size="sm" onClick={handleCreate} disabled={saving || !form.nome || !form.email || !form.senha}>
                        {saving ? "Salvando..." : "Criar"}
                    </Button>
                </div>
            </Modal>

            {/* ─── Edit Modal (TailAdmin Modal) ─── */}
            <Modal isOpen={formModalType === "edit" && !!target} onClose={() => setFormModalType(null)} className="max-w-[500px] p-6 lg:p-8">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">Editar — {target?.USRNome}</h3>
                <div className="space-y-3">
                    <InputField label="Nome" value={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
                    <InputField label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
                <div className="flex gap-3 justify-end pt-4">
                    <Button size="sm" variant="outline" onClick={() => setFormModalType(null)}>Cancelar</Button>
                    <Button size="sm" onClick={handleEdit} disabled={saving || !form.nome || !form.email}>
                        {saving ? "Salvando..." : "Salvar"}
                    </Button>
                </div>
            </Modal>

            {/* ─── Password Modal (TailAdmin Modal) ─── */}
            <Modal isOpen={formModalType === "password" && !!target} onClose={() => setFormModalType(null)} className="max-w-[500px] p-6 lg:p-8">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">Alterar Senha — {target?.USRNome}</h3>
                <div className="space-y-3">
                    <InputField label="Nova Senha *" type="password" value={form.senha} onChange={(v) => setForm({ ...form, senha: v })} />
                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
                <div className="flex gap-3 justify-end pt-4">
                    <Button size="sm" variant="outline" onClick={() => setFormModalType(null)}>Cancelar</Button>
                    <Button size="sm" onClick={handleResetPassword} disabled={saving || !form.senha || form.senha.length < 6}>
                        {saving ? "Salvando..." : "Alterar Senha"}
                    </Button>
                </div>
            </Modal>

            {/* ─── Confirmation Modal (TailAdmin warning/error style) ─── */}
            <Modal isOpen={confirmModal.isOpen} onClose={confirmModal.closeModal} className="max-w-[500px] p-5 lg:p-8">
                <div className="text-center">
                    {/* Icon */}
                    <div className="relative flex items-center justify-center z-1 mb-6">
                        <svg
                            className={isDelete ? "fill-error-50 dark:fill-error-500/15" : "fill-warning-50 dark:fill-warning-500/15"}
                            width="80"
                            height="80"
                            viewBox="0 0 90 90"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M34.364 6.85053C38.6205 -2.28351 51.3795 -2.28351 55.636 6.85053C58.0129 11.951 63.5594 14.6722 68.9556 13.3853C78.6192 11.0807 86.5743 21.2433 82.2185 30.3287C79.7862 35.402 81.1561 41.5165 85.5082 45.0122C93.3019 51.2725 90.4628 63.9451 80.7747 66.1403C75.3648 67.3661 71.5265 72.2695 71.5572 77.9156C71.6123 88.0265 60.1169 93.6664 52.3918 87.3184C48.0781 83.7737 41.9219 83.7737 37.6082 87.3184C29.8831 93.6664 18.3877 88.0266 18.4428 77.9156C18.4735 72.2695 14.6352 67.3661 9.22531 66.1403C-0.462787 63.9451 -3.30193 51.2725 4.49185 45.0122C8.84391 41.5165 10.2138 35.402 7.78151 30.3287C3.42572 21.2433 11.3808 11.0807 21.0444 13.3853C26.4406 14.6722 31.9871 11.951 34.364 6.85053Z"
                                fill=""
                                fillOpacity=""
                            />
                        </svg>
                        <span className="absolute -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2">
                            {isDelete ? (
                                <svg className="fill-error-600 dark:fill-error-500" width="34" height="34" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M9.62684 11.7496C9.04105 11.1638 9.04105 10.2141 9.62684 9.6283C10.2126 9.04252 11.1624 9.04252 11.7482 9.6283L18.9985 16.8786L26.2485 9.62851C26.8343 9.04273 27.7841 9.04273 28.3699 9.62851C28.9556 10.2143 28.9556 11.164 28.3699 11.7498L21.1198 18.9999L28.3699 26.25C28.9556 26.8358 28.9556 27.7855 28.3699 28.3713C27.7841 28.9571 26.8343 28.9571 26.2485 28.3713L18.9985 21.1212L11.7482 28.3715C11.1624 28.9573 10.2126 28.9573 9.62684 28.3715C9.04105 27.7857 9.04105 26.836 9.62684 26.2502L16.8771 18.9999L9.62684 11.7496Z" fill="" />
                                </svg>
                            ) : (
                                <svg className="fill-warning-600 dark:fill-orange-400" width="34" height="34" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M32.1445 19.0002C32.1445 26.2604 26.2589 32.146 18.9987 32.146C11.7385 32.146 5.85287 26.2604 5.85287 19.0002C5.85287 11.7399 11.7385 5.85433 18.9987 5.85433C26.2589 5.85433 32.1445 11.7399 32.1445 19.0002ZM18.9987 35.146C27.9158 35.146 35.1445 27.9173 35.1445 19.0002C35.1445 10.0831 27.9158 2.85433 18.9987 2.85433C10.0816 2.85433 2.85287 10.0831 2.85287 19.0002C2.85287 27.9173 10.0816 35.146 18.9987 35.146ZM21.0001 26.0855C21.0001 24.9809 20.1047 24.0855 19.0001 24.0855L18.9985 24.0855C17.894 24.0855 16.9985 24.9809 16.9985 26.0855C16.9985 27.19 17.894 28.0855 18.9985 28.0855L19.0001 28.0855C20.1047 28.0855 21.0001 27.19 21.0001 26.0855ZM18.9986 10.1829C19.827 10.1829 20.4986 10.8545 20.4986 11.6829L20.4986 20.6707C20.4986 21.4992 19.827 22.1707 18.9986 22.1707C18.1701 22.1707 17.4986 21.4992 17.4986 20.6707L17.4986 11.6829C17.4986 10.8545 18.1701 10.1829 18.9986 10.1829Z" fill="" />
                                </svg>
                            )}
                        </span>
                    </div>

                    <h4 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                        {confirmTitle}
                    </h4>
                    <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                        {confirmMessage}
                    </p>

                    <div className="flex items-center justify-center w-full gap-3 mt-7">
                        <button
                            type="button"
                            onClick={confirmModal.closeModal}
                            disabled={confirmLoading}
                            className="flex justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white rounded-lg ring-1 ring-inset ring-gray-300 shadow-theme-xs hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] sm:w-auto"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={confirmLoading}
                            className={`flex justify-center px-4 py-3 text-sm font-medium text-white rounded-lg shadow-theme-xs sm:w-auto ${isDelete
                                ? "bg-error-500 hover:bg-error-600"
                                : "bg-warning-500 hover:bg-warning-600"
                                } disabled:opacity-50`}
                        >
                            {confirmLoading ? "Processando..." : (isDelete ? "Sim, excluir" : "Sim, confirmar")}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Institutions Tab
// ════════════════════════════════════════════════════════════
function InstitutionsTab() {
    const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const router = useRouter();

    const load = useCallback((q?: string) => {
        setLoading(true);
        const url = q ? `/instituicoes?limit=100&search=${encodeURIComponent(q)}` : "/instituicoes?limit=100";
        apiGet<{ data: Instituicao[] }>(url)
            .then((res) => setInstituicoes(res.data || []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Handle search debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            load(search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search, load]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="relative w-full sm:max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <svg className="fill-current" width="18" height="18" viewBox="0 0 18 18">
                            <path d="M15.75 14.7188L11.5312 10.5C12.2062 9.59062 12.6 8.46562 12.6 7.25625C12.6 4.30312 10.2094 1.9125 7.25625 1.9125C4.30312 1.9125 1.9125 4.30312 1.9125 7.25625C1.9125 10.2094 4.30312 12.6 7.25625 12.6C8.46562 12.6 9.59062 12.2062 10.5 11.5312L14.7188 15.75L15.75 14.7188ZM3.375 7.25625C3.375 5.11875 5.11875 3.375 7.25625 3.375C9.39375 3.375 11.1375 5.11875 11.1375 7.25625C11.1375 9.39375 9.39375 11.1375 7.25625 11.1375C5.11875 11.1375 3.375 9.39375 3.375 7.25625Z" />
                        </svg>
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar por instituição ou cliente..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                    />
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Código</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Cliente</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : instituicoes.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Nenhuma instituição encontrada.</td></tr>
                        ) : instituicoes.map((i) => (
                            <tr
                                key={i.INSCodigo}
                                onClick={() => router.push(`/settings/institutions/${i.INSCodigo}`)}
                                className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                            >
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">#{i.INSCodigo}</td>
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90 font-medium">{i.INSNome}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{i.cliente?.CLINome || `CLI #${i.CLICodigo}`}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${i.INSAtivo
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
                                        }`}>
                                        {i.INSAtivo ? "Ativa" : "Inativa"}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-right">
                                    <button className="text-brand-500 hover:text-brand-600 font-medium text-sm">
                                        Configurar ERP
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════
// Shared UI — InputField
// ════════════════════════════════════════════════════════════
function InputField({ label, value, onChange, type = "text" }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
        </div>
    );
}
