"use client";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import { useState } from "react";
import { apiPost } from "@/lib/api";

export default function PasswordChangeCard() {
    const { isOpen, openModal, closeModal } = useModal();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Form state
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const handleSave = async () => {
        setError("");
        setSuccess("");

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError("Todos os campos são obrigatórios");
            return;
        }

        if (newPassword.length < 6) {
            setError("A nova senha deve ter no mínimo 6 caracteres");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("As senhas não coincidem");
            return;
        }

        try {
            setSaving(true);
            await apiPost("/usuarios/change-password", {
                currentPassword,
                newPassword,
            });

            setSuccess("Senha alterada com sucesso!");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");

            setTimeout(() => {
                closeModal();
                setSuccess("");
            }, 2000);
        } catch (err: any) {
            console.error("Erro ao alterar senha:", err);
            setError(err.message || "Erro ao alterar senha. Verifique se a senha atual está correta.");
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setError("");
        setSuccess("");
        closeModal();
    };

    return (
        <>
            <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
                            Segurança
                        </h4>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
                            <div>
                                <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                                    Senha
                                </p>
                                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                    ••••••••
                                </p>
                            </div>

                            <div>
                                <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                                    Última alteração
                                </p>
                                <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                    -
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={openModal}
                        className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
                    >
                        <svg
                            className="fill-current"
                            width="18"
                            height="18"
                            viewBox="0 0 18 18"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                fillRule="evenodd"
                                clipRule="evenodd"
                                d="M5.25 7.5V5.25C5.25 3.17893 6.92893 1.5 9 1.5C11.0711 1.5 12.75 3.17893 12.75 5.25V7.5H13.5C14.3284 7.5 15 8.17157 15 9V15C15 15.8284 14.3284 16.5 13.5 16.5H4.5C3.67157 16.5 3 15.8284 3 15V9C3 8.17157 3.67157 7.5 4.5 7.5H5.25ZM11.25 5.25V7.5H6.75V5.25C6.75 4.00736 7.75736 3 9 3C10.2426 3 11.25 4.00736 11.25 5.25Z"
                                fill=""
                            />
                        </svg>
                        Alterar Senha
                    </button>
                </div>
            </div>

            <Modal isOpen={isOpen} onClose={handleClose} className="max-w-[500px] m-4">
                <div className="relative w-full p-4 overflow-y-auto bg-white no-scrollbar rounded-3xl dark:bg-gray-900 lg:p-11">
                    <div className="px-2 pr-14">
                        <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
                            Alterar Senha
                        </h4>
                        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
                            Digite sua senha atual e escolha uma nova senha.
                        </p>
                    </div>

                    {error && (
                        <div className="mx-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {success && (
                        <div className="mx-2 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
                            <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
                        </div>
                    )}

                    <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                        <div className="px-2 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 gap-y-5">
                                <div>
                                    <Label>Senha Atual</Label>
                                    <Input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        placeholder="Digite sua senha atual"
                                        required
                                    />
                                </div>

                                <div>
                                    <Label>Nova Senha</Label>
                                    <Input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Digite a nova senha (mínimo 6 caracteres)"
                                        required
                                    />
                                </div>

                                <div>
                                    <Label>Confirmar Nova Senha</Label>
                                    <Input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Digite a nova senha novamente"
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
                            <Button size="sm" variant="outline" onClick={handleClose} type="button">
                                Cancelar
                            </Button>
                            <Button size="sm" type="submit" disabled={saving}>
                                {saving ? "Alterando..." : "Alterar Senha"}
                            </Button>
                        </div>
                    </form>
                </div>
            </Modal>
        </>
    );
}
