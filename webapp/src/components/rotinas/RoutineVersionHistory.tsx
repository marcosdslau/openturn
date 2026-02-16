import { useEffect, useState, useCallback } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { RotinaService, RotinaVersao } from "@/services/rotina.service";
import Button from "@/components/ui/button/Button";
import { TimeIcon } from "@/icons";

interface RoutineVersionHistoryProps {
    rotinaCodigo: number;
    instituicaoCodigo: number;
    currentCode: string; // Adicionado para comparar com o atual
    onRestore: (code: string) => void;
}

export default function RoutineVersionHistory({ rotinaCodigo, instituicaoCodigo, currentCode, onRestore }: RoutineVersionHistoryProps) {
    const [versions, setVersions] = useState<RotinaVersao[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<RotinaVersao | null>(null);
    const [loading, setLoading] = useState(true);

    const loadVersions = useCallback(async () => {
        setLoading(true);
        try {
            const data = await RotinaService.getVersions(rotinaCodigo, instituicaoCodigo);
            setVersions(data);
            if (data.length > 0) {
                setSelectedVersion(data[0]);
            }
        } catch (error) {
            console.error("Erro ao carregar versões", error);
        } finally {
            setLoading(false);
        }
    }, [rotinaCodigo, instituicaoCodigo]);

    useEffect(() => {
        loadVersions();
    }, [loadVersions]);

    const handleRestore = async () => {
        if (!selectedVersion) return;
        if (!confirm("Deseja restaurar esta versão? O código atual será substituído.")) return;

        try {
            await RotinaService.restoreVersion(selectedVersion.HVICodigo, instituicaoCodigo);
            onRestore(selectedVersion.HVICodigoJS);
            alert("Versão restaurada com sucesso!");
        } catch (error) {
            console.error("Erro ao restaurar versão", error);
            alert("Erro ao restaurar versão.");
        }
    };

    return (
        <div className="flex h-full gap-4 overflow-hidden">
            {/* Version List */}
            <div className="w-64 flex flex-col gap-2 border-r border-gray-200 dark:border-gray-800 pr-4 overflow-y-auto">
                <h4 className="font-semibold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
                    <TimeIcon className="w-4 h-4" />
                    Histórico
                </h4>

                {loading ? (
                    <p className="text-sm text-gray-500 text-center py-4">Carregando...</p>
                ) : versions.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Nenhuma versão anterior.</p>
                ) : (
                    versions.map((ver) => (
                        <button
                            key={ver.HVICodigo}
                            onClick={() => setSelectedVersion(ver)}
                            className={`text-left p-3 rounded-lg border transition-all hover:shadow-sm ${selectedVersion?.HVICodigo === ver.HVICodigo
                                ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20 ring-1 ring-brand-500"
                                : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                                }`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-gray-900 dark:text-white">
                                    {new Date(ver.createdAt).toLocaleString()}
                                </span>
                            </div>

                            {ver.HVIObservacao && (
                                <div className="text-xs text-brand-600 dark:text-brand-400 font-medium mb-1 line-clamp-2">
                                    {ver.HVIObservacao}
                                </div>
                            )}

                            <div className="text-[10px] text-gray-400 truncate">
                                Por: {ver.criador?.USRNome || "Sistema"}
                            </div>
                        </button>
                    ))
                )}
            </div>

            {/* Diff View */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="text-sm flex items-center gap-4">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="font-medium text-gray-600 dark:text-gray-300">Atual (Esquerda)</span>
                        </div>

                        <span className="text-gray-400">vs</span>

                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="font-medium text-gray-600 dark:text-gray-300">
                                Selecionada ({selectedVersion ? new Date(selectedVersion.createdAt).toLocaleString() : '-'})
                            </span>
                        </div>
                    </div>

                    {selectedVersion && (
                        <Button size="sm" variant="outline" onClick={handleRestore} className="bg-orange-50 hover:bg-orange-100 text-orange-600 border-orange-200">
                            Reverter para esta versão
                        </Button>
                    )}
                </div>

                <div className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden shadow-inner">
                    <DiffEditor
                        height="100%"
                        language="javascript"
                        theme="vs-dark"
                        original={currentCode}
                        modified={selectedVersion?.HVICodigoJS || ""}
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            renderSideBySide: true,
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                        }}
                    />
                </div>

                <p className="text-xs text-gray-500 text-center">
                    * O editor da esquerda mostra o código ATUAL. O da direita mostra a versão SELECIONADA.
                </p>
            </div>
        </div>
    );
}
