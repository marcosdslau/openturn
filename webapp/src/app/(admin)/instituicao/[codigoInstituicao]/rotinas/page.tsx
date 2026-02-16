"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import Button from "@/components/ui/button/Button";
import { Rotina, RotinaService } from "@/services/rotina.service";
import { ArrowRightIcon, TrashBinIcon, PencilIcon, PlusIcon, AlertIcon } from "@/icons";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { useToast } from "@/context/ToastContext";

export default function RotinasPage() {
    const { codigoInstituicao } = useTenant();
    const router = useRouter();
    const { showToast } = useToast();
    const deleteModal = useModal();
    const [rotinas, setRotinas] = useState<Rotina[]>([]);
    const [loading, setLoading] = useState(true);
    const [executing, setExecuting] = useState<number | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Rotina | null>(null);

    const loadRotinas = useCallback(async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const data = await RotinaService.getAll(codigoInstituicao);
            setRotinas(data);
        } catch (error) {
            console.error("Erro ao carregar rotinas", error);
            showToast("error", "Erro ao carregar", "Não foi possível carregar as rotinas.");
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, showToast]);

    useEffect(() => {
        loadRotinas();
    }, [loadRotinas]);

    const handleExecute = async (id: number) => {
        if (executing) return;
        setExecuting(id);
        try {
            await RotinaService.execute(id, codigoInstituicao);
            showToast("success", "Execução iniciada", "Acompanhe o progresso no console da rotina.");
            loadRotinas();
        } catch (error: any) {
            console.error("Erro ao executar rotina", error);
            showToast("error", "Erro na execução", error.message || "Não foi possível iniciar a rotina.");
        } finally {
            setExecuting(null);
        }
    };

    const handleDeleteClick = (rotina: Rotina) => {
        setDeleteTarget(rotina);
        deleteModal.openModal();
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await RotinaService.delete(deleteTarget.ROTCodigo, codigoInstituicao);
            showToast("success", "Rotina excluída", "A rotina foi removida com sucesso.");
            deleteModal.closeModal();
            loadRotinas();
        } catch (error: any) {
            console.error("Erro ao excluir rotina", error);
            showToast("error", "Erro ao excluir", error.message || "Ocorreu um erro ao tentar remover a rotina.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Rotinas de Execução</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gerencie scripts e automações da instituição</p>
                </div>
                <Button size="sm" onClick={() => router.push(`/instituicao/${codigoInstituicao}/rotinas/nova`)}>
                    <PlusIcon className="mr-2 h-4 w-4" />
                    Nova Rotina
                </Button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Tipo</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Última Execução</th>
                            <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {loading ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Carregando rotinas...</td></tr>
                        ) : rotinas.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Nenhuma rotina cadastrada.</td></tr>
                        ) : rotinas.map((rotina) => (
                            <tr key={rotina.ROTCodigo} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{rotina.ROTNome}</div>
                                    {rotina.ROTDescricao && <div className="text-xs text-gray-500 dark:text-gray-400">{rotina.ROTDescricao}</div>}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rotina.ROTTipo === 'SCHEDULE'
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                        }`}>
                                        {rotina.ROTTipo === 'SCHEDULE' ? 'Agendamento' : 'Webhook'}
                                    </span>
                                    {rotina.ROTCronExpressao && (
                                        <div className="mt-1 text-xs font-mono text-gray-500">{rotina.ROTCronExpressao}</div>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${rotina.ROTAtivo
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                                        }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${rotina.ROTAtivo ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                        {rotina.ROTAtivo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                    {rotina.ROTUltimaExecucao
                                        ? new Date(rotina.ROTUltimaExecucao).toLocaleString()
                                        : '-'}
                                </td>
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    <button
                                        onClick={() => handleExecute(rotina.ROTCodigo)}
                                        disabled={executing === rotina.ROTCodigo}
                                        className="p-2 text-gray-400 hover:text-green-500 transition-colors disabled:opacity-50"
                                        title="Executar Manualmente"
                                    >
                                        <ArrowRightIcon className={`w-4 h-4 ${executing === rotina.ROTCodigo ? 'animate-pulse' : ''}`} />
                                    </button>
                                    <button
                                        onClick={() => router.push(`/instituicao/${codigoInstituicao}/rotinas/${rotina.ROTCodigo}`)}
                                        className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                                        title="Editar"
                                    >
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteClick(rotina)}
                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                        title="Excluir"
                                    >
                                        <TrashBinIcon className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal de Confirmação de Exclusão */}
            <Modal
                isOpen={deleteModal.isOpen}
                onClose={deleteModal.closeModal}
                className="max-w-[450px] p-6 lg:p-8"
            >
                <div className="text-center">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full dark:bg-red-900/20">
                        <AlertIcon className="w-8 h-8 text-red-600 dark:text-red-500" />
                    </div>
                    <h4 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                        Confirmar Exclusão
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Tem certeza que deseja excluir a rotina <span className="font-semibold text-gray-800 dark:text-white">"{deleteTarget?.ROTNome}"</span>?
                        Esta ação não pode ser desfeita.
                    </p>

                    <div className="flex items-center justify-center gap-3 mt-8">
                        <Button
                            variant="outline"
                            onClick={deleteModal.closeModal}
                            className="w-full sm:w-auto"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={confirmDelete}
                            className="w-full bg-red-600 hover:bg-red-700 sm:w-auto"
                        >
                            Confirmar Exclusão
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
