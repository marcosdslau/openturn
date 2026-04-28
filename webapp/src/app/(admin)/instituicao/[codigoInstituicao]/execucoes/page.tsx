"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/context/TenantContext";
import { usePermissions } from "@/hooks/usePermissions";
import Button from "@/components/ui/button/Button";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import { Rotina, RotinaService } from "@/services/rotina.service";
import { 
    TrashBinIcon, 
    AlertIcon, 
    CloseIcon, 
    RefreshIcon, 
    ListIcon, 
    ChevronLeftIcon, 
    ArrowRightIcon,
    EyeIcon,
    BoxCubeIcon
} from "@/icons";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { useToast } from "@/context/ToastContext";
import Tooltip from "@/components/ui/tooltip/Tooltip";

interface RotinaExecucao {
    EXECodigo: number;
    EXEIdExterno: string;
    ROTCodigo: number;
    EXEStatus: string;
    EXEInicio: string;
    EXEFim?: string;
    EXEDuracaoMs?: number;
    EXEResultado?: any;
    EXEErro?: string;
    EXELogs?: any[];
    EXETrigger: string;
    EXERequestBody?: any;
    EXERequestParams?: any;
    EXERequestPath?: string;
    INSInstituicaoCodigo: number;
    createdAt: string;
    rotina?: {
        ROTNome: string;
    };
}

export default function ExecucoesPage() {
    const { codigoInstituicao } = useTenant();
    const { can } = usePermissions();
    const mayExecDelete = can("execucao", "delete");
    const mayExecReprocess = can("execucao", "reprocess");
    const mayExecCancel = can("execucao", "cancel_run");
    const showRowSelection = mayExecDelete || mayExecReprocess || mayExecCancel;
    const { showToast } = useToast();
    
    // Modals
    const detailsModal = useModal();
    const bulkModal = useModal();

    // Data State
    const [executions, setExecutions] = useState<RotinaExecucao[]>([]);
    const [rotinas, setRotinas] = useState<Rotina[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [totalPages, setTotalPages] = useState(1);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    // Filter State
    const [filters, setFilters] = useState({
        rotinaCodigo: "",
        status: "",
        trigger: "",
        startDate: "",
        endDate: "",
        searchError: "",
        searchLog: "",
        searchBody: "",
        executionId: "",
    });
    const [showFilters, setShowFilters] = useState(false);

    // Detail State
    const [selectedExecution, setSelectedExecution] = useState<RotinaExecucao | null>(null);
    const [detailType, setDetailType] = useState<"logs" | "result" | "webhook" | "error">("logs");

    // Action State
    const [bulkAction, setBulkAction] = useState<"delete" | "reprocess" | "cancel" | null>(null);
    const [actionOverlayBusy, setActionOverlayBusy] = useState(false);

    const loadExecutions = useCallback(async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const data = await RotinaService.getExecutions(codigoInstituicao, {
                page,
                limit,
                ...filters,
                rotinaCodigo: filters.rotinaCodigo ? Number(filters.rotinaCodigo) : undefined,
            });
            setExecutions(data.items);
            setTotal(data.total);
            setTotalPages(data.totalPages);
        } catch (error) {
            console.error("Erro ao carregar execuções", error);
            showToast("error", "Erro", "Não foi possível carregar o histórico de execuções.");
        } finally {
            setLoading(false);
        }
    }, [codigoInstituicao, page, limit, filters, showToast]);

    const loadRotinas = useCallback(async () => {
        if (!codigoInstituicao) return;
        try {
            const data = await RotinaService.getAll(codigoInstituicao);
            setRotinas(data);
        } catch (error) {
            console.error("Erro ao carregar rotinas", error);
        }
    }, [codigoInstituicao]);

    useEffect(() => {
        loadExecutions();
    }, [loadExecutions]);

    useEffect(() => {
        loadRotinas();
    }, [loadRotinas]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setPage(1); // Reset page on filter change
    };

    const clearFilters = () => {
        setFilters({
            rotinaCodigo: "",
            status: "",
            trigger: "",
            startDate: "",
            endDate: "",
            searchError: "",
            searchLog: "",
            searchBody: "",
            executionId: "",
        });
        setPage(1);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(executions.map(ex => ex.EXEIdExterno));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleReprocess = async (exeId: string) => {
        setActionOverlayBusy(true);
        try {
            await RotinaService.reprocessExecution(codigoInstituicao, exeId);
            showToast("success", "Sucesso", "Reprocessamento enfileirado com sucesso.");
            await loadExecutions();
        } catch (error: any) {
            showToast("error", "Erro", error.message || "Falha ao reprocessar.");
        } finally {
            setActionOverlayBusy(false);
        }
    };

    const handleCancel = async (exeId: string, rotinaCodigo: number) => {
        setActionOverlayBusy(true);
        try {
            await RotinaService.cancelExecution(rotinaCodigo, exeId, codigoInstituicao);
            showToast("info", "Cancelado", "Solicitação de cancelamento enviada.");
            await loadExecutions();
        } catch (error: any) {
            showToast("error", "Erro", error.message || "Falha ao cancelar.");
        } finally {
            setActionOverlayBusy(false);
        }
    };

    const handleDelete = async (exeId: string) => {
        setSelectedIds([exeId]);
        setBulkAction("delete");
        bulkModal.openModal();
    };

    const confirmBulkAction = async () => {
        if (!bulkAction || selectedIds.length === 0) return;

        const actionToRun = bulkAction;
        const idsPayload = [...selectedIds];

        bulkModal.closeModal();
        setActionOverlayBusy(true);

        try {
            const result = await RotinaService.bulkExecutionsAction(codigoInstituicao, {
                action: actionToRun,
                ids: idsPayload,
            });

            if (actionToRun === "delete") {
                const count = typeof result.count === "number" ? result.count : 0;
                if (count > 0) {
                    showToast("success", "Sucesso", `${count} registro(s) excluído(s).`);
                } else {
                    showToast(
                        "info",
                        "Atenção",
                        "Nenhum registro foi excluído."
                    );
                }
            } else {
                const processed =
                    typeof result.processed === "number" ? result.processed : 0;
                const msg =
                    actionToRun === "reprocess"
                        ? `${processed} reprocessamento(s) enfileirado(s).`
                        : `${processed} solicitação(ões) de cancelamento enviada(s).`;
                showToast("success", "Sucesso", msg);
            }
            setSelectedIds([]);
            await loadExecutions();
        } catch (error: any) {
            showToast("error", "Erro", error.message || "Falha na ação em lote.");
        } finally {
            setActionOverlayBusy(false);
        }
    };

    const openDetails = (exec: RotinaExecucao, type: "logs" | "result" | "webhook" | "error") => {
        setSelectedExecution(exec);
        setDetailType(type);
        detailsModal.openModal();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "SUCESSO":
                return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
            case "ERRO":
                return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
            case "TIMEOUT":
                return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
            case "CANCELADO":
                return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
            case "EM_EXECUCAO":
                return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse";
            default:
                return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Histórico de Execuções</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Acompanhe e gerencie todas as execuções de rotinas</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
                        <ListIcon className="mr-2 h-6 w-6" />
                        Filtros
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => loadExecutions()}>
                        <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Filtros */}
            {showFilters && (
                <div className="p-4 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Rotina</label>
                            <select 
                                name="rotinaCodigo"
                                value={filters.rotinaCodigo}
                                onChange={handleFilterChange}
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            >
                                <option value="">Todas</option>
                                {rotinas.map(r => <option key={r.ROTCodigo} value={r.ROTCodigo}>{r.ROTNome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                            <select 
                                name="status"
                                value={filters.status}
                                onChange={handleFilterChange}
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            >
                                <option value="">Todos</option>
                                <option value="SUCESSO">Sucesso</option>
                                <option value="ERRO">Erro</option>
                                <option value="TIMEOUT">Timeout</option>
                                <option value="CANCELADO">Cancelado</option>
                                <option value="EM_EXECUCAO">Em Execução</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                            <select 
                                name="trigger"
                                value={filters.trigger}
                                onChange={handleFilterChange}
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            >
                                <option value="">Todos</option>
                                <option value="SCHEDULE">Agendamento</option>
                                <option value="WEBHOOK">Webhook</option>
                                <option value="MANUAL">Manual</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Início</label>
                            <input 
                                type="datetime-local"
                                name="startDate"
                                value={filters.startDate}
                                onChange={handleFilterChange}
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Fim</label>
                            <input 
                                type="datetime-local"
                                name="endDate"
                                value={filters.endDate}
                                onChange={handleFilterChange}
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Execution ID</label>
                            <input 
                                type="text"
                                name="executionId"
                                value={filters.executionId}
                                onChange={handleFilterChange}
                                placeholder="Buscar ID..."
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Conteúdo de Erro</label>
                            <input 
                                type="text"
                                name="searchError"
                                value={filters.searchError}
                                onChange={handleFilterChange}
                                placeholder="Texto no erro..."
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Conteúdo de Log</label>
                            <input 
                                type="text"
                                name="searchLog"
                                value={filters.searchLog}
                                onChange={handleFilterChange}
                                placeholder="Texto nos logs..."
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Conteúdo do Body</label>
                            <input 
                                type="text"
                                name="searchBody"
                                value={filters.searchBody}
                                onChange={handleFilterChange}
                                placeholder="Texto no body JSON..."
                                className="w-full text-sm rounded-lg border-gray-200 dark:border-gray-800 dark:bg-gray-900"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={clearFilters}>Limpar</Button>
                        <Button size="sm" onClick={() => { setPage(1); loadExecutions(); }}>Filtrar</Button>
                    </div>
                </div>
            )}

            {/* Ações em Lote */}
            {showRowSelection && selectedIds.length > 0 && (
                <div className="p-3 bg-brand-50 border border-brand-100 rounded-xl dark:bg-brand-500/10 dark:border-brand-500/20 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                    <span className="text-sm font-medium text-brand-700 dark:text-brand-400">
                        {selectedIds.length} selecionado(s)
                    </span>
                    <div className="flex gap-2">
                        {mayExecDelete && (
                            <Button size="sm" variant="outline" disabled={actionOverlayBusy} className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => { setBulkAction("delete"); bulkModal.openModal(); }}>
                                <TrashBinIcon className="mr-1 h-6 w-6" /> Excluir
                            </Button>
                        )}
                        {mayExecReprocess && (
                            <Button size="sm" variant="outline" disabled={actionOverlayBusy} className="border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => { setBulkAction("reprocess"); bulkModal.openModal(); }}>
                                <RefreshIcon className="mr-1 h-6 w-6" /> Reprocessar
                            </Button>
                        )}
                        {mayExecCancel && (
                            <Button size="sm" variant="outline" disabled={actionOverlayBusy} className="border-amber-200 text-amber-600 hover:bg-amber-50" onClick={() => { setBulkAction("cancel"); bulkModal.openModal(); }}>
                                <CloseIcon className="mr-1 h-6 w-6" /> Cancelar
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Tabela */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full min-w-[1000px]">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
                            {showRowSelection && (
                                <th className="px-4 py-4 text-left">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.length === executions.length && executions.length > 0}
                                        onChange={handleSelectAll}
                                        disabled={actionOverlayBusy}
                                        className="rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-brand-500 focus:ring-brand-500 disabled:opacity-50" 
                                    />
                                </th>
                            )}
                            <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Rotina / ID</th>
                            <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status / Tipo</th>
                            <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Início / Fim</th>
                            <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Duração</th>
                            <th className="px-4 py-4 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Dados</th>
                            <th className="px-4 py-4 text-right text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {loading ? (
                            <tr><td colSpan={showRowSelection ? 7 : 6} className="px-6 py-12 text-center text-gray-400">
                                <RefreshIcon className="h-8 w-8 animate-spin mx-auto mb-2 opacity-20" />
                                Carregando execuções...
                            </td></tr>
                        ) : executions.length === 0 ? (
                            <tr><td colSpan={showRowSelection ? 7 : 6} className="px-6 py-12 text-center text-gray-400">Nenhuma execução encontrada para os filtros aplicados.</td></tr>
                        ) : executions.map((ex) => (
                            <tr key={ex.EXEIdExterno} className="hover:bg-gray-50 dark:hover:bg-white/[0.01] transition-colors group">
                                {showRowSelection && (
                                    <td className="px-4 py-4">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.includes(ex.EXEIdExterno)}
                                            onChange={() => handleSelectOne(ex.EXEIdExterno)}
                                            disabled={actionOverlayBusy}
                                            className="rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-brand-500 focus:ring-brand-500 disabled:opacity-50"
                                        />
                                    </td>
                                )}
                                <td className="px-4 py-4">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{ex.rotina?.ROTNome || "Rotina Desconhecida"}</div>
                                    <div className="text-[10px] font-mono text-gray-400 mt-0.5 truncate max-w-[150px]" title={ex.EXEIdExterno}>
                                        {ex.EXEIdExterno}
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex flex-col gap-1.5">
                                        <span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadge(ex.EXEStatus)}`}>
                                            {ex.EXEStatus}
                                        </span>
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium ml-1">
                                            {ex.EXETrigger === "SCHEDULE" ? "AGENDAMENTO" : ex.EXETrigger}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-xs">
                                    <div className="text-gray-700 dark:text-gray-300">{new Date(ex.EXEInicio).toLocaleString()}</div>
                                    <div className="text-gray-400 mt-1">
                                        {ex.EXEFim ? new Date(ex.EXEFim).toLocaleString() : "-"}
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-sm text-gray-500">
                                    {ex.EXEDuracaoMs ? `${(ex.EXEDuracaoMs / 1000).toFixed(2)}s` : "-"}
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex gap-2">
                                        {ex.EXELogs && (ex.EXELogs as any[]).length > 0 && (
                                            <Tooltip content="Ver Logs">
                                                <button onClick={() => openDetails(ex, "logs")} className="p-1.5 rounded-md hover:bg-blue-50 text-blue-500">
                                                    <ListIcon className="w-6 h-6" />
                                                </button>
                                            </Tooltip>
                                        )}
                                        {ex.EXEResultado && (
                                            <Tooltip content="Resultado">
                                                <button onClick={() => openDetails(ex, "result")} className="p-1.5 rounded-md hover:bg-green-50 text-green-500">
                                                    <BoxCubeIcon className="w-6 h-6" />
                                                </button>
                                            </Tooltip>
                                        )}
                                        {ex.EXEErro && (
                                            <Tooltip content="Ver Erro">
                                                <button onClick={() => openDetails(ex, "error")} className="p-1.5 rounded-md hover:bg-red-50 text-red-500">
                                                    <AlertIcon className="w-6 h-6" />
                                                </button>
                                            </Tooltip>
                                        )}
                                        {ex.EXETrigger === "WEBHOOK" && (
                                            <Tooltip content="Dados Webhook">
                                                <button onClick={() => openDetails(ex, "webhook")} className="p-1.5 rounded-md hover:bg-purple-50 text-purple-500">
                                                    <EyeIcon className="w-6 h-6" />
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <div className="flex justify-end gap-1">
                                        {ex.EXEStatus === "EM_EXECUCAO" ? (
                                            mayExecCancel && (
                                                <Tooltip content="Encerrar">
                                                    <button type="button" onClick={() => handleCancel(ex.EXEIdExterno, ex.ROTCodigo)} disabled={actionOverlayBusy} className="p-1.5 rounded-md hover:bg-red-50 text-red-500 disabled:opacity-50">
                                                        <CloseIcon className="w-6 h-6" />
                                                    </button>
                                                </Tooltip>
                                            )
                                        ) : (
                                            mayExecReprocess && (
                                                <Tooltip content="Reprocessar">
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleReprocess(ex.EXEIdExterno)} 
                                                        disabled={actionOverlayBusy}
                                                        className="p-1.5 rounded-md hover:bg-blue-50 text-blue-500 disabled:opacity-50"
                                                    >
                                                        <RefreshIcon className="w-4 h-4" />
                                                    </button>
                                                </Tooltip>
                                            )
                                        )}
                                        {mayExecDelete && (
                                            <Tooltip content="Excluir Registro">
                                                <button type="button" onClick={() => handleDelete(ex.EXEIdExterno)} disabled={actionOverlayBusy} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-50">
                                                    <TrashBinIcon className="w-4 h-4" />
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Paginação */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Registros por página:</span>
                    <select
                        value={limit}
                        onChange={(e) => {
                            setLimit(Number(e.target.value));
                            setPage(1);
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:outline-none"
                    >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                        <option value={500}>500</option>
                        <option value={750}>750</option>
                        <option value={1000}>1000</option>
                        <option value={1500}>1500</option>
                        <option value={2000}>2000</option>
                        <option value={2500}>2500</option>
                        <option value={3000}>3000</option>
                        <option value={3500}>3500</option>
                        <option value={4000}>4000</option>
                        <option value={4500}>4500</option>
                        <option value={5000}>5000</option>
                    </select>
                </div>

                {totalPages > 1 && (
                    <PaginationWithIcon
                        totalPages={totalPages}
                        initialPage={page}
                        onPageChange={(p) => setPage(p)}
                    />
                )}

                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total: {total} registros
                </p>
            </div>

            {/* Modal Detalhes */}
            <Modal
                isOpen={detailsModal.isOpen}
                onClose={detailsModal.closeModal}
                className="max-w-[800px] p-0 overflow-hidden"
                showCloseButton={false}
            >
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02] flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 dark:text-white">
                        {detailType === "logs" && "Logs de Execução"}
                        {detailType === "result" && "Resultado da Execução"}
                        {detailType === "error" && "Detalhes do Erro"}
                        {detailType === "webhook" && "Dados da Requisição (Webhook)"}
                    </h3>
                    <button onClick={detailsModal.closeModal} className="p-1 hover:bg-gray-100 rounded-md transition-colors">
                        <CloseIcon className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto bg-white dark:bg-gray-950">
                    {detailType === "logs" && (
                        <div className="space-y-2 font-mono text-[13px]">
                            {selectedExecution?.EXELogs?.map((log, idx) => (
                                <div key={idx} className={`p-2 rounded border-l-4 ${
                                    log.level === 'error' ? 'bg-red-50 border-red-500 text-red-800 dark:bg-red-950/20 dark:text-red-400' :
                                    log.level === 'warn' ? 'bg-amber-50 border-amber-500 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400' :
                                    'bg-gray-50 border-gray-300 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300'
                                }`}>
                                    <div className="flex justify-between items-center mb-1 opacity-70 text-[10px]">
                                        <span>[{log.level.toUpperCase()}]</span>
                                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div className="whitespace-pre-wrap">{log.message}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {detailType === "result" && (
                        <pre className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs overflow-auto dark:text-gray-300">
                            {JSON.stringify(selectedExecution?.EXEResultado, null, 2)}
                        </pre>
                    )}
                    {detailType === "error" && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg text-red-800 dark:text-red-400 whitespace-pre-wrap text-sm font-mono">
                            {selectedExecution?.EXEErro}
                        </div>
                    )}
                    {detailType === "webhook" && (
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Path</label>
                                <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded font-mono text-sm">{selectedExecution?.EXERequestPath || "-"}</div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Params</label>
                                <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded font-mono text-xs">{JSON.stringify(selectedExecution?.EXERequestParams, null, 2)}</pre>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Body</label>
                                <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded font-mono text-xs">{JSON.stringify(selectedExecution?.EXERequestBody, null, 2)}</pre>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end bg-gray-50/50 dark:bg-white/[0.02]">
                    <Button variant="outline" size="sm" onClick={detailsModal.closeModal}>Fechar</Button>
                </div>
            </Modal>

            {/* Modal Lote */}
            <Modal
                isOpen={bulkModal.isOpen}
                onClose={bulkModal.closeModal}
                className="max-w-[450px] p-6 lg:p-8"
            >
                <div className="text-center">
                    <div className={`flex items-center justify-center w-16 h-16 mx-auto mb-6 rounded-full ${
                        bulkAction === 'delete' ? 'bg-red-100 dark:bg-red-900/20' : 
                        bulkAction === 'reprocess' ? 'bg-blue-100 dark:bg-blue-900/20' :
                        'bg-amber-100 dark:bg-amber-900/20'
                    }`}>
                        {bulkAction === 'delete' && <TrashBinIcon className="w-8 h-8 text-red-600 dark:text-red-500" />}
                        {bulkAction === 'reprocess' && <RefreshIcon className="w-8 h-8 text-blue-600 dark:text-blue-500" />}
                        {bulkAction === 'cancel' && <CloseIcon className="w-8 h-8 text-amber-600 dark:text-amber-500" />}
                    </div>
                    <h4 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
                        {bulkAction === 'delete' && "Confirmar Exclusão"}
                        {bulkAction === 'reprocess' && "Reprocessar Execuções"}
                        {bulkAction === 'cancel' && "Cancelar Execuções"}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Deseja realizar a ação <span className="font-bold uppercase">{bulkAction}</span> para <span className="font-semibold text-gray-800 dark:text-white">{selectedIds.length}</span> registro(s)?
                    </p>

                    <div className="flex items-center justify-center gap-3 mt-8">
                        <Button variant="outline" disabled={actionOverlayBusy} onClick={bulkModal.closeModal} className="w-full sm:w-auto">Cancelar</Button>
                        <Button disabled={actionOverlayBusy} onClick={confirmBulkAction} className={`w-full sm:w-auto ${
                            bulkAction === 'delete' ? 'bg-red-600 hover:bg-red-700' :
                            bulkAction === 'reprocess' ? 'bg-blue-600 hover:bg-blue-700' :
                            'bg-amber-600 hover:bg-amber-700'
                        }`}>
                            Confirmar
                        </Button>
                    </div>
                </div>
            </Modal>

            {typeof document !== "undefined" &&
                actionOverlayBusy &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px] dark:bg-black/55"
                        role="status"
                        aria-live="polite"
                        aria-busy="true"
                    >
                        <div className="flex flex-col items-center gap-4 rounded-2xl bg-white px-8 py-7 shadow-xl ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-white/10">
                            <RefreshIcon className="h-10 w-10 animate-spin text-brand-500" aria-hidden />
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Processando…</p>
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
