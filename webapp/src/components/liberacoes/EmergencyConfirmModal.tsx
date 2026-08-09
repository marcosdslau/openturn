"use client";

import { Modal } from "../ui/modal";
import { AlertIcon } from "@/icons";

interface EmergencyConfirmModalProps {
    isOpen: boolean;
    /** `true` = vai ativar a emergência; `false` = vai desativar. */
    targetMode: boolean;
    equipamentoNome: string;
    onConfirm: () => void;
    onClose: () => void;
}

export default function EmergencyConfirmModal({
    isOpen,
    targetMode,
    equipamentoNome,
    onConfirm,
    onClose,
}: EmergencyConfirmModalProps) {
    const title = targetMode
        ? "Ativar modo de emergência?"
        : "Desativar modo de emergência?";

    const description = targetMode
        ? "A catraca ficará com o giro liberado nos dois sentidos, sem qualquer controle de acesso, até que o modo de emergência seja desativado manualmente."
        : "A catraca voltará ao controle normal de acesso. Somente pessoas autorizadas poderão passar.";

    const confirmLabel = targetMode ? "Sim, ativar emergência" : "Sim, desativar";

    const accentClasses = targetMode
        ? {
            halo: "bg-error-50 dark:bg-error-500/15",
            icon: "text-error-600 dark:text-error-500",
            confirm: "bg-error-500 hover:bg-error-600",
        }
        : {
            halo: "bg-brand-50 dark:bg-brand-500/15",
            icon: "text-brand-600 dark:text-brand-500",
            confirm: "bg-brand-500 hover:bg-brand-600",
        };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            showCloseButton={false}
            className="relative m-5 w-full max-w-[600px] overflow-hidden rounded-3xl bg-white p-6 sm:m-0 lg:p-10 dark:bg-gray-900"
        >
            <div className="text-center">
                <div
                    className={`mx-auto mb-6 flex size-24 items-center justify-center rounded-full ${accentClasses.halo}`}
                >
                    <AlertIcon className={`size-12 ${accentClasses.icon}`} />
                </div>

                <h4 className="mb-3 text-2xl font-semibold text-gray-800 sm:text-3xl dark:text-white/90">
                    {title}
                </h4>

                <p className="mb-2 text-base font-medium text-gray-700 dark:text-gray-300">
                    {equipamentoNome}
                </p>

                <p className="text-base leading-6 text-gray-500 dark:text-gray-400">
                    {description}
                </p>

                <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
                    <button
                        type="button"
                        onClick={onClose}
                        className="shadow-theme-xs flex flex-1 justify-center rounded-lg border border-gray-300 bg-white px-6 py-4 text-base font-semibold text-gray-700 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`shadow-theme-xs flex flex-1 justify-center rounded-lg px-6 py-4 text-base font-semibold text-white transition ${accentClasses.confirm}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
