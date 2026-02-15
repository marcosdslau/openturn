import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { CloseIcon } from '@/icons';
import Button from '@/components/ui/button/Button';

interface RoutineDiffModalProps {
    isOpen: boolean;
    onClose: () => void;
    originalCode: string; // The older version
    modifiedCode: string; // The current version (or newer)
    originalLabel?: string;
    modifiedLabel?: string;
    onRestore: () => void;
}

export function RoutineDiffModal({
    isOpen,
    onClose,
    originalCode,
    modifiedCode,
    originalLabel = 'Original',
    modifiedLabel = 'Modified',
    onRestore,
}: RoutineDiffModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Compare Versions</h3>
                        <div className="flex items-center gap-4 text-xs mt-1">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span className="text-gray-500">{originalLabel}</span>
                            </span>
                            <span className="text-gray-300">→</span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span className="text-gray-500">{modifiedLabel}</span>
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={onRestore} className="bg-orange-600 hover:bg-orange-700 text-white">
                            Restore this Version
                        </Button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
                        >
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 bg-[#1e1e1e]">
                    <DiffEditor
                        height="100%"
                        language="javascript"
                        theme="vs-dark"
                        original={originalCode}
                        modified={modifiedCode}
                        options={{
                            readOnly: true,
                            renderSideBySide: true,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
