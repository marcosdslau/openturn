import React from 'react';
import { HistoryIcon, RefreshIcon } from '@/icons'; // Assuming these icons exist or I will use text
import Button from '@/components/ui/button/Button';

export interface RoutineVersion {
    HVICodigo: number;
    ROTCodigo: number;
    HVICodigoJS: string;
    HVIObservacao: string | null;
    createdAt: string; // ISO string from API
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
    onRefresh: () => void;
}

export function VersionHistory({
    versions,
    loading,
    onSelectVersion,
    onRestoreVersion,
    onRefresh
}: VersionHistoryProps) {
    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 w-80">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Version History</h3>
                    <p className="text-xs text-gray-500 mt-1">Snapshots and backups</p>
                </div>
                <button
                    onClick={onRefresh}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-500 transition-colors"
                    title="Refresh List"
                >
                    {/* Fallback to text if icon not found, assuming icons import might fail if not checked */}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="text-center text-sm text-gray-400 py-8">Loading versions...</div>
                ) : versions.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8">No history available.</div>
                ) : (
                    versions.map((version) => (
                        <div
                            key={version.HVICodigo}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-xs font-mono text-gray-500">#{version.HVICodigo}</span>
                                <span className="text-xs text-gray-400">
                                    {new Date(version.createdAt).toLocaleString()}
                                </span>
                            </div>

                            <div className="mb-2">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                                    {version.HVIObservacao ||
                                        (version.HVICodigoJS.includes('Versão inicial') ? 'Initial Version' : 'No description')}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    by {version.criador.USRNome}
                                </p>
                            </div>

                            <div className="flex gap-2 mt-3">
                                <Button
                                    size="xs"
                                    variant="outline"
                                    className="w-full justify-center"
                                    onClick={() => onSelectVersion(version)}
                                >
                                    Compare
                                </Button>
                                <Button
                                    size="xs"
                                    variant="secondary" // Use secondary for restore action to differentiate
                                    className="w-full justify-center"
                                    onClick={() => {
                                        if (confirm(`Restore version #${version.HVICodigo}? Current code will be overwritten.`)) {
                                            onRestoreVersion(version);
                                        }
                                    }}
                                >
                                    Restore
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
