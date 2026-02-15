"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor, { OnMount } from "@monaco-editor/react";
import { RotinaService, Rotina, RotinaVersao } from "@/services/rotina.service";
import { RoutineHelper } from "@/components/rotinas/RoutineHelper";
import { VersionHistory, RoutineVersion } from "@/components/rotinas/VersionHistory";
import { RoutineDiffModal } from "@/components/rotinas/RoutineDiffModal";
import { ConsolePanel } from "@/components/rotinas/ConsolePanel";
import Button from "@/components/ui/button/Button";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/context/ToastContext";
import {
    ArrowRightIcon,
    CheckLineIcon,
    TimeIcon,
    CloseIcon,
    ChevronLeftIcon,
    InfoIcon,
    PencilIcon
} from "@/icons";
import { CronBuilder } from "@/components/rotinas/CronBuilder";

// Basic icon fallback if needed, but assuming imports work based on index.tsx check
// Note: BookIcon might not be in index.tsx, I'll use list-icon or similar if needed. 
// I checked index.tsx and ListIcon exists. I'll use ListIcon instead of BookIcon.

export default function RoutineEditorPage() {
    const params = useParams();
    const router = useRouter();
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();
    const id = Number(params?.id);

    const [rotina, setRotina] = useState<Rotina | null>(null);
    const [code, setCode] = useState<string>("");
    const [originalCode, setOriginalCode] = useState<string>(""); // For diffing unsaved changes if needed, or version comparison
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [activeTab, setActiveTab] = useState<'helper' | 'history' | null>('helper');

    // Versioning
    const [versions, setVersions] = useState<RoutineVersion[]>([]);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [diffModalOpen, setDiffModalOpen] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<RoutineVersion | null>(null);

    // Settings Modal
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsForm, setSettingsForm] = useState<Partial<Rotina>>({});

    const editorRef = useRef<any>(null);

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        // Add extra libs or configuration here if needed
    };

    const loadRotina = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const data = await RotinaService.getById(id, codigoInstituicao);
            setRotina(data);
            setSettingsForm({
                ROTNome: data.ROTNome,
                ROTDescricao: data.ROTDescricao,
                ROTTipo: data.ROTTipo,
                ROTCronExpressao: data.ROTCronExpressao,
                ROTWebhookPath: data.ROTWebhookPath,
                ROTAtivo: data.ROTAtivo
            });
            setCode(data.ROTCodigoJS || "// Escreva seu código aqui...");
            setOriginalCode(data.ROTCodigoJS || "");
        } catch (error) {
            console.error("Erro ao carregar rotina", error);
            showToast("error", "Erro", "Erro ao carregar rotina");
            router.push(`/instituicao/${codigoInstituicao}/rotinas`);
        } finally {
            setLoading(false);
        }
    }, [id, codigoInstituicao, router]);

    const loadVersions = useCallback(async () => {
        if (!id) return;
        setLoadingVersions(true);
        try {
            const data = await RotinaService.getVersions(id, codigoInstituicao);
            // Map RotinaVersao to RoutineVersion (compatible types)
            setVersions(data as any);
        } catch (error) {
            console.error("Erro ao carregar versões", error);
        } finally {
            setLoadingVersions(false);
        }
    }, [id]);

    useEffect(() => {
        loadRotina();
    }, [loadRotina]);

    useEffect(() => {
        if (activeTab === 'history') {
            loadVersions();
        }
    }, [activeTab, loadVersions]);

    const handleSaveSettings = async () => {
        if (!rotina) return;
        try {
            await RotinaService.update(rotina.ROTCodigo, {
                ...settingsForm,
                INSInstituicaoCodigo: codigoInstituicao
            });
            showToast("success", "Sucesso", "Configurações salvas!");
            setSettingsOpen(false);
            loadRotina();
        } catch (error) {
            console.error("Erro ao salvar configurações", error);
            showToast("error", "Erro", "Erro ao salvar configurações");
        }
    };

    const handleSave = async () => {
        if (!rotina) return;
        setSaving(true);
        try {
            const observacao = `${rotina.ROTNome} - ${new Date().toLocaleString('pt-BR')}`;
            await RotinaService.update(rotina.ROTCodigo, {
                ROTCodigoJS: code,
                observacao,
                INSInstituicaoCodigo: codigoInstituicao
            });
            showToast("success", "Sucesso", "Rotina salva com sucesso!");
            loadRotina(); // Reload to get updated timestamp etc
        } catch (error) {
            console.error("Erro ao salvar", error);
            showToast("error", "Erro", "Erro ao salvar rotina");
        } finally {
            setSaving(false);
        }
    };

    const handleExecute = async () => {
        if (!rotina) return;
        setExecuting(true);
        try {
            // Auto-save before execute? Maybe nice, but let's confirm first or just execute stored?
            // Usually execution runs the STORED code. User should save first.
            // But we can offer a "Save & Execute" or just warn.
            // For now, let's just trigger execution of what is on server.

            if (code !== rotina.ROTCodigoJS) {
                if (!confirm("Existem alterações não salvas. A execução usará a última versão SALVA. Deseja continuar?")) {
                    setExecuting(false);
                    return;
                }
            }

            await RotinaService.execute(rotina.ROTCodigo, codigoInstituicao);
            showToast("info", "Execução", "Execução iniciada! Acompanhe no console.");
        } catch (error) {
            console.error("Erro ao executar", error);
            showToast("error", "Erro", "Erro ao iniciar execução");
        } finally {
            setExecuting(false);
        }
    };

    const handleRestore = async (version: RoutineVersion) => {
        try {
            await RotinaService.restoreVersion(version.HVICodigo, codigoInstituicao);
            // Update editor
            setCode(version.HVICodigoJS);
            setRotina(prev => prev ? { ...prev, ROTCodigoJS: version.HVICodigoJS } : null);
            setDiffModalOpen(false);
            showToast("success", "Restaurado", `Restaurado para versão de ${new Date(version.createdAt).toLocaleString()}`);
            loadVersions(); // Refresh list as restore creates a new version usually
        } catch (error) {
            console.error("Error restoring version", error);
            showToast("error", "Erro", "Erro ao restaurar versão");
        }
    };

    const handleInsertSnippet = (snippet: string) => {
        if (editorRef.current) {
            const contribution = editorRef.current.getPosition();
            editorRef.current.executeEdits("snippet", [{
                range: {
                    startLineNumber: contribution.lineNumber,
                    startColumn: contribution.column,
                    endLineNumber: contribution.lineNumber,
                    endColumn: contribution.column
                },
                text: snippet,
                forceMoveMarkers: true
            }]);
            editorRef.current.focus();
        }
    };

    if (loading) return <div className="p-8 text-center">Carregando editor...</div>;
    if (!rotina) return <div className="p-8 text-center">Rotina não encontrada</div>;

    return (
        <div className="flex flex-col h-[calc(100vh-7rem)] w-full">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push(`/instituicao/${codigoInstituicao}/rotinas`)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
                    >
                        <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            {rotina.ROTNome}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${rotina.ROTAtivo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {rotina.ROTAtivo ? 'ATIVO' : 'INATIVO'}
                            </span>
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">{rotina.ROTTipo} • {rotina.ROTCronExpressao || rotina.ROTWebhookPath}</p>
                            <button onClick={() => setSettingsOpen(true)} className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1">
                                <PencilIcon className="w-3 h-3" /> Editar Configurações
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 mr-2">
                        <button
                            onClick={() => setActiveTab(activeTab === 'helper' ? null : 'helper')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${activeTab === 'helper'
                                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                        >
                            <InfoIcon className="w-3 h-3" /> Helper
                        </button>
                        <button
                            onClick={() => setActiveTab(activeTab === 'history' ? null : 'history')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${activeTab === 'history'
                                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                        >
                            <TimeIcon className="w-3 h-3" /> History
                        </button>
                    </div>

                    <Button
                        onClick={handleExecute}
                        size="sm"
                        variant="outline"
                        disabled={executing}
                        className="gap-2"
                    >
                        {executing ? (
                            <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                        ) : (
                            <ArrowRightIcon className="w-4 h-4" />
                        )}
                        Execute
                    </Button>
                    <Button
                        onClick={handleSave}
                        size="sm"
                        disabled={saving}
                        className="gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                        <CheckLineIcon className="w-4 h-4" />
                        Save Changes
                    </Button>
                </div>
            </div>

            {/* Main Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Editor Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 relative overflow-hidden">
                        <div className="absolute inset-0">
                            <Editor
                                height="100%"
                                defaultLanguage="javascript"
                                theme="vs-dark"
                                value={code}
                                onChange={(value) => setCode(value || "")}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    wordWrap: 'on',
                                    automaticLayout: true,
                                }}
                                onMount={handleEditorDidMount}
                            />
                        </div>
                    </div>
                    {/* Console Panel */}
                    <div className="h-48 shrink-0">
                        <ConsolePanel rotinaCodigo={rotina.ROTCodigo} height="100%" />
                    </div>
                </div>

                {/* Sidebar */}
                {activeTab && (
                    <div className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden flex flex-col">
                        {activeTab === 'helper' && (
                            <RoutineHelper onInsertSnippet={handleInsertSnippet} />
                        )}
                        {activeTab === 'history' && (
                            <VersionHistory
                                versions={versions}
                                loading={loadingVersions}
                                onRefresh={loadVersions}
                                onSelectVersion={(v) => {
                                    setSelectedVersion(v);
                                    setDiffModalOpen(true);
                                }}
                                onRestoreVersion={handleRestore}
                            />
                        )}
                    </div>
                )}
            </div>

            <RoutineDiffModal
                isOpen={diffModalOpen}
                onClose={() => setDiffModalOpen(false)}
                originalCode={selectedVersion?.HVICodigoJS || ""}
                modifiedCode={code} // Comparing selected version (original) against current editor code (modified/current)
                originalLabel={`Version #${selectedVersion?.HVICodigo}`}
                modifiedLabel="Current Editor"
                onRestore={() => selectedVersion && handleRestore(selectedVersion)}
            />

            {/* Simple Settings Modal */}
            {settingsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl p-6 relative">
                        <button onClick={() => setSettingsOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Configurações da Rotina</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome</label>
                                <input
                                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                    value={settingsForm.ROTNome || ''}
                                    onChange={e => setSettingsForm({ ...settingsForm, ROTNome: e.target.value })}
                                />
                            </div>

                            {settingsForm.ROTTipo === 'SCHEDULE' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agendamento (Cron)</label>
                                    <CronBuilder
                                        value={settingsForm.ROTCronExpressao || ''}
                                        onChange={val => setSettingsForm({ ...settingsForm, ROTCronExpressao: val })}
                                    />
                                </div>
                            )}

                            {settingsForm.ROTTipo === 'WEBHOOK' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Webhook Path</label>
                                    <input
                                        className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                        value={settingsForm.ROTWebhookPath || ''}
                                        onChange={e => setSettingsForm({ ...settingsForm, ROTWebhookPath: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                <input
                                    type="checkbox"
                                    id="rotAtivo"
                                    checked={settingsForm.ROTAtivo ?? true}
                                    onChange={e => setSettingsForm({ ...settingsForm, ROTAtivo: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <label htmlFor="rotAtivo" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                                    Rotina Ativa
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveSettings}>Salvar Configurações</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
