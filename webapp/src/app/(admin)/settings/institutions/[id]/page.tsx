"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPut, apiPost, apiDelete } from "@/lib/api";
import Breadcrumb from "@/components/ui/breadcrumb/Breadcrumb";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import Button from "@/components/ui/button/Button";
import { PlusIcon, TrashBinIcon, EyeIcon, EyeCloseIcon } from "@/icons";
import Alert from "@/components/ui/alert/Alert";

interface ConnectorStatus {
    paired: boolean;
    connectorId?: number;
    nome?: string;
    status?: string;
    versao?: string;
    ultimoHeartbeat?: string;
}

interface Instituicao {
    INSCodigo: number;
    INSNome: string;
    CLICodigo: number;
    cliente?: { CLINome: string };
    INSConfigHardware?: any;
}

interface ERPConfig {
    ERPCodigo?: number;
    ERPSistema: string;
    ERPUrlBase: string | null;
    ERPToken: string | null;
    ERPConfigJson: any | null;
}

const ERP_OPTIONS = [
    { value: "Gennera", label: "Gennera" },
    { value: "Perseus", label: "Perseus" },
    { value: "Totvs", label: "Totvs" },
    { value: "Lyceum", label: "Lyceum" },
    { value: "Delta", label: "Delta" },
    { value: "Sponte", label: "Sponte" },
    { value: "iScholar", label: "iScholar" },
    { value: "Mentor", label: "Mentor" },
    { value: "EscolaWEB", label: "EscolaWEB" },
];

export default function InstitutionERPPage() {
    const { id } = useParams();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [instituicao, setInstituicao] = useState<Instituicao | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Form states
    const [sistema, setSistema] = useState("");
    const [urlBase, setUrlBase] = useState("");
    const [token, setToken] = useState("");
    const [usuarioAPI, setUsuarioAPI] = useState("");
    const [senhaUserAPI, setSenhaUserAPI] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);

    // Log Retention settings
    const [autoExcluirLogs, setAutoExcluirLogs] = useState(true);
    const [diasRetencao, setDiasRetencao] = useState(90);

    // Hardware Monitor settings
    const [monitorIp, setMonitorIp] = useState("");
    const [monitorPort, setMonitorPort] = useState(80);
    const [monitorPath, setMonitorPath] = useState("");

    // Connector On-Premise
    const [connector, setConnector] = useState<ConnectorStatus | null>(null);
    const [pairName, setPairName] = useState("");
    const [showPairModal, setShowPairModal] = useState(false);
    const [pairResult, setPairResult] = useState<{ token: string; wsUrl: string } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [instRes, configRes, connStatus] = await Promise.all([
                apiGet<Instituicao & { INSLogsAutoExcluir: boolean, INSLogsDiasRetencao: number }>(`/instituicoes/${id}`),
                apiGet<ERPConfig | null>(`/instituicoes/${id}/erp-config`),
                apiGet<ConnectorStatus>(`/instituicao/${id}/connector/status`).catch(() => ({ paired: false })),
            ]);
            setConnector(connStatus);

            setInstituicao(instRes);
            setAutoExcluirLogs(instRes.INSLogsAutoExcluir ?? true);
            setDiasRetencao(instRes.INSLogsDiasRetencao ?? 90);

            // Load Monitor Config
            const hwConfig = instRes.INSConfigHardware || {};
            setMonitorIp(hwConfig.controlid?.monitor?.ip || "");
            setMonitorPort(hwConfig.controlid?.monitor?.port || 0);
            setMonitorPath(hwConfig.controlid?.monitor?.path || `/api/instituicao/${instRes.INSCodigo}/monitor/controlid`);

            if (configRes) {
                setSistema(configRes.ERPSistema);
                setUrlBase(configRes.ERPUrlBase || "");
                setToken(configRes.ERPToken || "");

                const extra = configRes.ERPConfigJson || {};
                setUsuarioAPI(extra.usuarioAPI || "");
                setSenhaUserAPI(extra.senhaUserAPI || "");

                if (extra.headers && typeof extra.headers === 'object') {
                    const hList = Object.entries(extra.headers).map(([key, value]) => ({
                        key,
                        value: String(value)
                    }));
                    setHeaders(hList);
                }
            }
        } catch (err) {
            setError("Não foi possível carregar os dados da instituição.");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const addHeader = () => setHeaders([...headers, { key: "", value: "" }]);
    const removeHeader = (index: number) => setHeaders(headers.filter((_, i) => i !== index));
    const updateHeader = (index: number, field: "key" | "value", val: string) => {
        const next = [...headers];
        next[index][field] = val;
        setHeaders(next);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const headerObj: Record<string, string> = {};
            headers.forEach(h => {
                if (h.key.trim()) headerObj[h.key.trim()] = h.value;
            });

            // Update ERP Config
            const erpPromise = apiPut(`/instituicoes/${id}/erp-config`, {
                ERPSistema: sistema,
                ERPUrlBase: urlBase || null,
                ERPToken: token || null,
                ERPConfigJson: {
                    usuarioAPI: usuarioAPI || null,
                    senhaUserAPI: senhaUserAPI || null,
                    headers: headerObj
                }
            });

            // Update Institution settings (new fields)
            const currentConfig = instituicao?.INSConfigHardware || {};
            const newConfig = {
                ...currentConfig,
                controlid: {
                    ...(currentConfig.controlid || {}),
                    monitor: {
                        ip: monitorIp,
                        port: monitorPort,
                        path: monitorPath
                    }
                }
            };

            const instPromise = apiPut(`/instituicoes/${id}`, {
                INSLogsAutoExcluir: autoExcluirLogs,
                INSLogsDiasRetencao: diasRetencao,
                INSConfigHardware: newConfig
            });

            await Promise.all([erpPromise, instPromise]);

            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError("Erro ao salvar as configurações.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <Breadcrumb
                items={[
                    { label: "Dashboard", href: "/" },
                    { label: "Configurações", href: "/settings" },
                    { label: instituicao?.INSNome || "Instituição" },
                ]}
            />

            <h2 className="text-2xl font-bold text-gray-800 dark:text-white/90">
                Configurações: {instituicao?.INSNome || "Instituição"}
            </h2>

            {error && <Alert variant="error" title="Erro" message={error} />}
            {success && <Alert variant="success" title="Sucesso" message="Configurações salvas com sucesso." />}

            <form onSubmit={handleSave} className="space-y-6">

                {/* Connector On-Premise */}
                <ComponentCard
                    title="Connector On-Premise (Addon)"
                    desc="Ponte segura entre o OpenTurn SaaS e equipamentos na rede local da instituição."
                >
                    {connector?.paired ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                <div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${connector.status === 'ONLINE' ? 'bg-green-500' : connector.status === 'PAIRING' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                                        <span className="text-sm font-medium text-gray-800 dark:text-white">{connector.status}</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Nome</span>
                                    <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">{connector.nome}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Versão</span>
                                    <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">{connector.versao || '—'}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Último Heartbeat</span>
                                    <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">
                                        {connector.ultimoHeartbeat ? new Date(connector.ultimoHeartbeat).toLocaleTimeString() : '—'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                        try {
                                            const res = await apiPost(`/instituicao/${id}/connector/token`, {});
                                            alert(`Novo Token:\n${res.token}`);
                                            loadData();
                                        } catch (e: any) { alert(e.message); }
                                    }}
                                >
                                    🔑 Renovar Token
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                        if (!confirm('Tem certeza que deseja desparear o Connector?')) return;
                                        try {
                                            await apiDelete(`/instituicao/${id}/connector/unpair`);
                                            loadData();
                                        } catch (e: any) { alert(e.message); }
                                    }}
                                    className="text-red-500 hover:text-red-700"
                                >
                                    ✕ Desparear
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Nenhum Connector pareado. Para conectar equipamentos em rede local sem IP público, pareie um Connector.
                            </p>
                            {showPairModal ? (
                                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                                    {pairResult ? (
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium text-green-600 dark:text-green-400">✅ Connector pareado com sucesso!</p>
                                            <div>
                                                <Label>Comando para instalar:</Label>
                                                <code className="block mt-1 p-3 bg-gray-900 text-green-400 rounded text-xs font-mono overflow-x-auto">
                                                    openturn-connector pair
                                                </code>
                                            </div>
                                            <div>
                                                <Label>Token (cole no wizard):</Label>
                                                <code className="block mt-1 p-3 bg-gray-900 text-yellow-400 rounded text-xs font-mono overflow-x-auto break-all">
                                                    {pairResult.token}
                                                </code>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => { setShowPairModal(false); setPairResult(null); loadData(); }}>Fechar</Button>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <Label>Nome do Connector</Label>
                                                <InputField
                                                    type="text"
                                                    placeholder="Ex: Servidor Portaria"
                                                    value={pairName}
                                                    onChange={(e: any) => setPairName(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={!pairName}
                                                    onClick={async () => {
                                                        try {
                                                            const res = await apiPost(`/instituicao/${id}/connector/pair`, { CONNome: pairName });
                                                            setPairResult(res);
                                                        } catch (e: any) { alert(e.message); }
                                                    }}
                                                >
                                                    Parear
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setShowPairModal(false)}>Cancelar</Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <Button size="sm" onClick={() => setShowPairModal(true)}>
                                    + Parear Connector
                                </Button>
                            )}
                        </div>
                    )}
                </ComponentCard>

                {/* Hardware Monitor Config */}
                <ComponentCard
                    title="Hardware Monitor (ControlID)"
                    desc="Configurações para recepção de eventos online (Push) dos dispositivos ControlID."
                >
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                            <Label>IP do Monitor (Servidor)</Label>
                            <InputField
                                type="text"
                                placeholder="Ex: 192.168.1.10"
                                value={monitorIp}
                                onChange={(e) => setMonitorIp(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Porta</Label>
                            <InputField
                                type="number"
                                placeholder="Ex: 8000"
                                value={monitorPort.toString()}
                                onChange={(e) => setMonitorPort(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <Label>Path Base (Opcional)</Label>
                            <InputField
                                type="text"
                                placeholder="Ex: /api/monitor"
                                value={monitorPath}
                                onChange={(e) => setMonitorPath(e.target.value)}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Caso o monitor esteja atrás de um proxy reverso com prefixo.
                            </p>
                        </div>
                    </div>
                </ComponentCard>

                <ComponentCard
                    title="Configuração do ERP Educacional"
                    desc="Preencha as credenciais de acesso para integração com o sistema de gestão acadêmica."
                >
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {/* ERP System Selection */}
                        <div className="sm:col-span-2">
                            <Label>Sistema ERP</Label>
                            <Select
                                options={ERP_OPTIONS}
                                defaultValue={sistema}
                                placeholder="Selecione o ERP"
                                onChange={(val) => setSistema(val)}
                            />
                        </div>

                        {/* Base URL */}
                        <div className="sm:col-span-2">
                            <Label>URL Base da API</Label>
                            <InputField
                                type="text"
                                placeholder="https://api.erp.com/v1"
                                value={urlBase}
                                onChange={(e) => setUrlBase(e.target.value)}
                            />
                        </div>

                        {/* Token */}
                        <div className="sm:col-span-2">
                            <Label>Token de Acesso / API Key</Label>
                            <InputField
                                type="text"
                                placeholder="Bearer eyJhbGci..."
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                            />
                        </div>

                        {/* API User */}
                        <div>
                            <Label>Usuário da API (opcional)</Label>
                            <InputField
                                type="text"
                                placeholder="usuario_integracao"
                                value={usuarioAPI}
                                onChange={(e) => setUsuarioAPI(e.target.value)}
                            />
                        </div>

                        {/* API Password */}
                        <div className="relative">
                            <Label>Senha da API (opcional)</Label>
                            <InputField
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                value={senhaUserAPI}
                                onChange={(e) => setSenhaUserAPI(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-[38px] text-gray-500 dark:text-gray-400 hover:text-brand-500"
                            >
                                {showPassword ? <EyeCloseIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                            </button>
                        </div>

                        {/* Custom Headers */}
                        <div className="sm:col-span-2">
                            <div className="flex items-center justify-between mb-2">
                                <Label className="mb-0">Configurações/Campos Extras</Label>
                                <button
                                    type="button"
                                    onClick={addHeader}
                                    className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1"
                                >
                                    <PlusIcon className="w-4 h-4" /> Adicionar Campo
                                </button>
                            </div>

                            <div className="space-y-3">
                                {headers.length === 0 && (
                                    <p className="text-sm text-gray-400 italic">Nenhuma configuração extra.</p>
                                )}
                                {headers.map((h, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className="flex-1">
                                            <InputField
                                                placeholder="Chave (ex: X-Tenant-ID)"
                                                value={h.key}
                                                onChange={(e) => updateHeader(idx, "key", e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <InputField
                                                placeholder="Valor"
                                                value={h.value}
                                                onChange={(e) => updateHeader(idx, "value", e.target.value)}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeHeader(idx)}
                                            className="p-2.5 text-gray-400 hover:text-error-500 transition-colors"
                                        >
                                            <TrashBinIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </ComponentCard>

                {/* Log Retention Settings */}
                <ComponentCard
                    title="Retenção de Logs"
                    desc="Configure a política de descarte automático de logs de execução de rotinas."
                >
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div className="sm:col-span-2 flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="autoExcluirLogs"
                                checked={autoExcluirLogs}
                                onChange={(e) => setAutoExcluirLogs(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800"
                            />
                            <Label htmlFor="autoExcluirLogs" className="mb-0 cursor-pointer">
                                Ativar exclusão automática de logs antigos
                            </Label>
                        </div>

                        <div>
                            <Label>Dias de retenção</Label>
                            <InputField
                                type="number"
                                min="1"
                                max="3650"
                                value={diasRetencao.toString()}
                                onChange={(e: any) => setDiasRetencao(parseInt(e.target.value) || 0)}
                                disabled={!autoExcluirLogs}
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                Após este período, os logs de rotinas serão permanentemente removidos.
                            </p>
                        </div>
                    </div>
                </ComponentCard>

                <div className="flex items-center justify-end gap-3">
                    <Button
                        variant="outline"
                        onClick={() => router.push("/settings")}
                        disabled={saving}
                    >
                        Voltar
                    </Button>
                    <Button
                        type="submit"
                        disabled={saving}
                    >
                        {saving ? "Salvando..." : "Salvar Configurações"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
