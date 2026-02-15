import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import Button from "@/components/ui/button/Button";
import { CreateRotinaDto, Rotina, RotinaService } from "@/services/rotina.service";
import { InfoIcon } from "@/icons";

interface RoutineFormProps {
    initialData?: Rotina;
    onSave: () => void;
    onCancel: () => void;
    instituicaoCodigo: number;
}

const DEFAULT_CODE = `/**
 * Rotina de Execução
 * Contexto disponível: 
 * - context.db: Acesso ao banco de dados (seguro por tenant)
 * - context.adapters.equipamentos: Lista de equipamentos ativos
 * - context.request: Dados da requisição (se webhook)
 * - console: Logs (log, info, warn, error)
 */
return async (context, console) => {
  console.log('Iniciando rotina...');
  
  // Seu código aqui
  
  return { success: true };
};`;

export default function RoutineForm({ initialData, onSave, onCancel, instituicaoCodigo }: RoutineFormProps) {
    const [form, setForm] = useState<CreateRotinaDto>({
        ROTNome: "",
        ROTDescricao: "",
        ROTTipo: "SCHEDULE",
        ROTCronExpressao: "",
        ROTWebhookPath: "",
        ROTWebhookMetodo: "POST",
        ROTWebhookSeguro: true,
        ROTCodigoJS: DEFAULT_CODE,
        ROTAtivo: true,
        ROTTimeoutSeconds: 30,
        INSInstituicaoCodigo: instituicaoCodigo,
        observacao: "", // Para versionamento
    });

    const [saving, setSaving] = useState(false);
    const [showHelper, setShowHelper] = useState(true);

    useEffect(() => {
        if (initialData) {
            setForm({
                ROTNome: initialData.ROTNome,
                ROTDescricao: initialData.ROTDescricao || "",
                ROTTipo: initialData.ROTTipo,
                ROTCronExpressao: initialData.ROTCronExpressao || "",
                ROTWebhookPath: initialData.ROTWebhookPath || "",
                ROTWebhookMetodo: initialData.ROTWebhookMetodo || "POST",
                ROTWebhookSeguro: initialData.ROTWebhookSeguro,
                ROTCodigoJS: initialData.ROTCodigoJS,
                ROTAtivo: initialData.ROTAtivo,
                ROTTimeoutSeconds: initialData.ROTTimeoutSeconds,
                INSInstituicaoCodigo: initialData.INSInstituicaoCodigo,
                observacao: "",
            });
        }
    }, [initialData]);

    const handleSubmit = async () => {
        setSaving(true);
        try {
            if (initialData) {
                await RotinaService.update(initialData.ROTCodigo, form);
            } else {
                await RotinaService.create(form);
            }
            onSave();
        } catch (error) {
            console.error("Erro ao salvar rotina", error);
            alert("Erro ao salvar rotina");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex h-full gap-4">
            {/* Main Form */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
                        <input
                            value={form.ROTNome}
                            onChange={(e) => setForm({ ...form, ROTNome: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            placeholder="Ex: Sincronização Noturna"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                        <select
                            value={form.ROTTipo}
                            onChange={(e) => setForm({ ...form, ROTTipo: e.target.value as any })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        >
                            <option value="SCHEDULE">Agendamento (Cron)</option>
                            <option value="WEBHOOK">Webhook (HTTP)</option>
                        </select>
                    </div>
                </div>

                {form.ROTTipo === "SCHEDULE" && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Expressão Cron</label>
                        <input
                            value={form.ROTCronExpressao}
                            onChange={(e) => setForm({ ...form, ROTCronExpressao: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            placeholder="Ex: 0 0 * * *"
                        />
                        <p className="text-xs text-gray-500">Use formato padrão cron (minuto hora dia mês semana)</p>
                    </div>
                )}

                {form.ROTTipo === "WEBHOOK" && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Path / Metodo</label>
                            <div className="flex gap-2">
                                <input
                                    value={form.ROTWebhookPath}
                                    onChange={(e) => setForm({ ...form, ROTWebhookPath: e.target.value })}
                                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                    placeholder="Ex: /sync-users"
                                />
                                <select
                                    value={form.ROTWebhookMetodo}
                                    onChange={(e) => setForm({ ...form, ROTWebhookMetodo: e.target.value as any })}
                                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                                >
                                    <option value="POST">POST</option>
                                    <option value="GET">GET</option>
                                    <option value="PUT">PUT</option>
                                </select>
                            </div>
                        </div>
                        <div className="space-y-2 flex items-center pt-8">
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.ROTWebhookSeguro}
                                    onChange={(e) => setForm({ ...form, ROTWebhookSeguro: e.target.checked })}
                                    className="rounded border-gray-300 text-brand-500"
                                />
                                Exigir Autenticação (Token)
                            </label>
                        </div>
                    </div>
                )}

                <div className="flex-1 flex flex-col border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden min-h-[400px]">
                    <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex justify-between items-center">
                        <span className="text-xs font-semibold uppercase text-gray-500">Editor de Código (JavaScript / Node.js)</span>
                        <button onClick={() => setShowHelper(!showHelper)} className="text-xs text-brand-500 hover:underline">
                            {showHelper ? "Ocultar Ajuda" : "Mostrar Ajuda"}
                        </button>
                    </div>
                    <Editor
                        height="100%"
                        defaultLanguage="javascript"
                        theme="vs-dark"
                        value={form.ROTCodigoJS}
                        onChange={(value) => setForm({ ...form, ROTCodigoJS: value || "" })}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            scrollBeyondLastLine: false,
                        }}
                    />
                </div>

                {initialData && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Observação da Versão (Opcional)</label>
                        <input
                            value={form.observacao}
                            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            placeholder="Descreva o que mudou nesta versão..."
                        />
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={saving || !form.ROTNome}>
                        {saving ? "Salvando..." : "Salvar Rotina"}
                    </Button>
                </div>
            </div>

            {/* Helper Sidebar */}
            {showHelper && (
                <div className="w-80 bg-gray-50 dark:bg-gray-900/50 border-l border-gray-200 dark:border-gray-800 p-4 overflow-y-auto text-sm space-y-4">
                    <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <InfoIcon className="w-4 h-4" />
                        Documentação
                    </h4>

                    <div className="space-y-2">
                        <h5 className="font-medium text-gray-700 dark:text-gray-300 border-b pb-1">Contexto Global</h5>
                        <p className="text-gray-600 dark:text-gray-400 text-xs">O objeto <code>context</code> fornece acesso seguro aos recursos da instituição.</p>
                        <ul className="list-disc pl-4 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                            <li><code>context.instituicao</code>: Dados da instituição atual.</li>
                            <li><code>context.request</code>: Body/Query da requisição (Webhook).</li>
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <h5 className="font-medium text-gray-700 dark:text-gray-300 border-b pb-1">Banco de Dados (Prisma)</h5>
                        <p className="text-gray-600 dark:text-gray-400 text-xs">Acesso via <code>context.db</code>. RLS aplicado automaticamente.</p>
                        <pre className="bg-gray-200 dark:bg-gray-800 p-2 rounded text-xs overflow-x-auto">
                            {`// Exemplo: Buscar pessoas
const pessoas = await context.db.pESPessoa.findMany({
  where: { PESAtivo: true }
});`}
                        </pre>
                    </div>

                    <div className="space-y-2">
                        <h5 className="font-medium text-gray-700 dark:text-gray-300 border-b pb-1">Equipamentos</h5>
                        <p className="text-gray-600 dark:text-gray-400 text-xs">Lista de catracas ativas em <code>context.adapters.equipamentos</code>.</p>
                        <pre className="bg-gray-200 dark:bg-gray-800 p-2 rounded text-xs overflow-x-auto">
                            {`context.adapters.equipamentos.forEach(eq => {
  console.log(eq.ip, eq.nome);
});`}
                        </pre>
                    </div>

                    <div className="space-y-2">
                        <h5 className="font-medium text-gray-700 dark:text-gray-300 border-b pb-1">Logging</h5>
                        <p className="text-gray-600 dark:text-gray-400 text-xs">Use o objeto <code>console</code> para logs em tempo real.</p>
                        <ul className="list-disc pl-4 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                            <li><code>console.log(&quot;msg&quot;)</code></li>
                            <li><code>console.error(&quot;erro&quot;)</code></li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
