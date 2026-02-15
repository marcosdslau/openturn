"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { RotinaService } from "@/services/rotina.service";
import Button from "@/components/ui/button/Button";
import { useTenant } from "@/context/TenantContext";
import { ChevronLeftIcon, InfoIcon, AlertIcon } from "@/icons";
import { CronBuilder } from "@/components/rotinas/CronBuilder";

export default function NovaRotinaPage() {
    const { codigoInstituicao } = useTenant();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        ROTNome: "",
        ROTDescricao: "",
        ROTTipo: "WEBHOOK", // Default
        ROTCronExpressao: "0 * * * *", // Default hourly
        ROTWebhookPath: "/minha-rotina",
        ROTWebhookMetodo: "POST",
        ROTWebhookSeguro: true,
        ROTCodigoJS: `/**
 * Rotina de Exemplo
 * context: { db, adapters, console }
 */
export default async function(context, console) {
    console.log('Iniciando execução...');
    
    // Exemplo: Listar equipamentos
    const equipamentos = context.adapters.equipamentos;
    console.info(\`Equipamentos ativos: \${equipamentos.length}\`);
    
    return { message: 'Execução concluída com sucesso' };
}`,
        ROTTimeoutSeconds: 30,
        ROTAtivo: true
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const newRotina = await RotinaService.create({
                ...formData,
                INSInstituicaoCodigo: codigoInstituicao
            } as any);

            router.push(`/instituicao/${codigoInstituicao}/rotinas/${newRotina.ROTCodigo}`);
        } catch (error) {
            console.error("Erro ao criar rotina", error);
            alert("Erro ao criar rotina. Verifique os dados.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => router.back()}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
                >
                    <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Nova Rotina</h1>
                    <p className="text-sm text-gray-500">Crie uma nova automação para sua instituição</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 shadow-sm">

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da Rotina</label>
                        <input
                            type="text"
                            required
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="Ex: Sync de Alunos"
                            value={formData.ROTNome}
                            onChange={(e) => setFormData({ ...formData, ROTNome: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
                        <textarea
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[80px]"
                            placeholder="O que esta rotina faz?"
                            value={formData.ROTDescricao}
                            onChange={(e) => setFormData({ ...formData, ROTDescricao: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Gatilho</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={formData.ROTTipo}
                                onChange={(e) => setFormData({ ...formData, ROTTipo: e.target.value as any })}
                            >
                                <option value="WEBHOOK">Webhook (HTTP)</option>
                                <option value="SCHEDULE">Agendamento (Cron)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timeout (segundos)</label>
                            <input
                                type="number"
                                min="1" max="2000"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                value={formData.ROTTimeoutSeconds}
                                onChange={(e) => setFormData({ ...formData, ROTTimeoutSeconds: Number(e.target.value) })}
                            />
                        </div>
                    </div>

                    {formData.ROTTipo === 'SCHEDULE' && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-3">
                            <label className="block text-sm font-medium text-blue-900 dark:text-blue-300 mb-1 flex items-center gap-2">
                                <InfoIcon className="w-4 h-4" /> Configuração do Agendamento (Cron)
                            </label>

                            <CronBuilder
                                value={formData.ROTCronExpressao || '0 * * * *'}
                                onChange={(val) => setFormData({ ...formData, ROTCronExpressao: val })}
                            />
                        </div>
                    )}

                    {formData.ROTTipo === 'WEBHOOK' && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-purple-900 dark:text-purple-300 mb-1">Caminho do Webhook</label>
                                <div className="flex">
                                    <span className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-lg text-gray-500 text-sm flex items-center">
                                        /api/webhooks
                                    </span>
                                    <input
                                        type="text"
                                        className="flex-1 px-3 py-2 border border-purple-200 dark:border-purple-800 rounded-r-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                        placeholder="/minha-rotina"
                                        value={formData.ROTWebhookPath}
                                        onChange={(e) => setFormData({ ...formData, ROTWebhookPath: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="secure"
                                    checked={formData.ROTWebhookSeguro}
                                    onChange={(e) => setFormData({ ...formData, ROTWebhookSeguro: e.target.checked })}
                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                />
                                <label htmlFor="secure" className="text-sm text-purple-900 dark:text-purple-300">Exigir autenticação (Token)</label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <Button variant="outline" onClick={() => router.back()} type="button">Cancelar</Button>
                    <Button type="submit" disabled={loading} className="min-w-[120px]">
                        {loading ? 'Criando...' : 'Criar Rotina'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
