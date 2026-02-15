import React, { useState } from 'react';
// Verify icons exist or use inline SVGs for safety to avoid build errors
import Button from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal';

export interface RoutineVersion {
    HVICodigo: number;
    ROTCodigo: number;
    HVICodigoJS: string;
    HVIObservacao: string | null;
    createdAt: string;
    criador: {
        USRCodigo: number;
        USRNome: string;
    };
}

interface VersionHistoryProps {
    versions: RoutineVersion[];
    loading: boolean;
    onSelectVersion: (version: RoutineVersion) => void;
    onRestoreVersion: (version: RoutineVersion) => void;
    onDeleteVersions: (versionIds: number[]) => void;
    onRefresh: () => void;
}

export function VersionHistory({
    versions,
    loading,
    onSelectVersion,
    onRestoreVersion,
    onDeleteVersions,
    onRefresh
}: VersionHistoryProps) {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const toggleSelection = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleDeleteClick = () => {
        if (selectedIds.length === 0) return;
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        onDeleteVersions(selectedIds);
        setIsDeleteModalOpen(false);
        setSelectedIds([]);
    };

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 w-80">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Histórico</h3>
                    <p className="text-xs text-gray-500 mt-1">Versões e backups</p>
                </div>
                <div className="flex gap-1">
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleDeleteClick}
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded transition-colors"
                            title="Excluir Selecionados"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    )}
                    <button
                        onClick={onRefresh}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-500 transition-colors"
                        title="Atualizar Lista"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="text-center text-sm text-gray-400 py-8">Carregando versões...</div>
                ) : versions.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8">Nenhum histórico disponível.</div>
                ) : (
                    versions.map((version) => (
                        <div
                            key={version.HVICodigo}
                            className={`bg-white dark:bg-gray-800 border rounded-lg p-3 transition-colors ${selectedIds.includes(version.HVICodigo)
                                ? 'border-blue-500 ring-1 ring-blue-500'
                                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(version.HVICodigo)}
                                        onChange={() => toggleSelection(version.HVICodigo)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                    />
                                    <span className="text-xs font-mono text-gray-500">#{version.HVICodigo}</span>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {new Date(version.createdAt).toLocaleString()}
                                </span>
                            </div>

                            <div className="mb-2 pl-6">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                                    {version.HVIObservacao ||
                                        (version.HVICodigoJS.includes('Versão inicial') ? 'Versão Inicial' : 'Sem descrição')}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    por {version.criador.USRNome}
                                </p>
                            </div>

                            <div className="flex gap-2 mt-3 pl-6">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full justify-center text-xs py-1 h-7"
                                    onClick={() => onSelectVersion(version)}
                                >
                                    Comparar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full justify-center text-xs py-1 h-7 text-gray-600"
                                    onClick={() => {
                                        // Auto-select and open modal for single delete flow could be added,
                                        // or keep Restore. Wait, request was DELETE.
                                        // Keeping Restore button as it is key functionality.
                                        // Deletion is handled via selection + header button.
                                        if (confirm(`Restaurar versão #${version.HVICodigo}?`)) {
                                            onRestoreVersion(version);
                                        }
                                    }}
                                >
                                    Restaurar
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                className="max-w-md p-6"
            >
                <div className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
                        <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                        Excluir {selectedIds.length} versão(ões)?
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                        Essa ação é irreversível. O histórico selecionado será apagado permanentemente.
                    </p>
                    <div className="flex justify-center gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setIsDeleteModalOpen(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            className="bg-red-600 hover:bg-red-700 text-white border-transparent"
                            onClick={confirmDelete}
                        >
                            Sim, excluir
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
