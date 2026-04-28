"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/context/TenantContext";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { useToast } from "@/context/ToastContext";
import { AlertIcon, UserCircleIcon } from "@/icons";
import PessoasFiltros, {
    PESSOA_FILTROS_VAZIOS,
    buildPessoaListQuery,
    type PessoaFiltrosAplicados,
} from "./components/PessoasFiltros";
import LimiarFacialSlider from "@/components/form/LimiarFacialSlider";

interface Pessoa {
    PESCodigo: number;
    PESNome: string;
    PESNomeSocial: string | null;
    PESDocumento: string | null;
    PESEmail: string | null;
    PESTelefone: string | null;
    PESCelular: string | null;
    PESCartaoTag: string | null;
    PESFotoBase64: string | null;
    PESFotoExtensao: string | null;
    PESAtivo: boolean;
    PESLimiarFacial?: number;
    PESGemeo?: boolean;
}

interface Mapeamento {
    PEQCodigo: number;
    PEQIdNoEquipamento: string;
    EQPCodigo: number;
    equipamento: {
        EQPDescricao: string;
        EQPMarca: string;
        EQPModelo: string;
    };
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

export default function PessoasPage() {
    const router = useRouter();
    const { codigoInstituicao } = useTenant();
    const { can } = usePermissions();
    const { showToast } = useToast();
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [filtrosAplicados, setFiltrosAplicados] = useState<PessoaFiltrosAplicados>(
        PESSOA_FILTROS_VAZIOS
    );
    const [gruposDisponiveis, setGruposDisponiveis] = useState<string[]>([]);

    // Modals
    const personModal = useModal();
    const deactivateModal = useModal();
    const mappingModal = useModal();
    const deleteFromDevicesModal = useModal();

    const [form, setForm] = useState({
        PESNome: "",
        PESDocumento: "",
        PESEmail: "",
        PESCelular: "",
        PESCartaoTag: "",
        PESLimiarFacial: 680,
        PESGemeo: false,
    });
    const [saving, setSaving] = useState(false);
    const [deactivateTarget, setDeactivateTarget] = useState<Pessoa | null>(null);
    const [editing, setEditing] = useState<Pessoa | null>(null);

    const [mappingTarget, setMappingTarget] = useState<Pessoa | null>(null);
    const [mappings, setMappings] = useState<Mapeamento[]>([]);
    const [loadingMappings, setLoadingMappings] = useState(false);
    const [syncingPerson, setSyncingPerson] = useState(false);
    const [deletingFromDevices, setDeletingFromDevices] = useState(false);

    const load = useCallback(async () => {
        if (!codigoInstituicao) return;
        setLoading(true);
        try {
            const qs = buildPessoaListQuery(page, limit, filtrosAplicados);
            const res = await apiGet<{ data: Pessoa[]; meta: Meta }>(
                `/instituicao/${codigoInstituicao}/pessoa?${qs}`
            );
            setPessoas(res.data || []);
            setMeta(res.meta);
        } catch (error: any) {
            showToast("error", "Erro ao carregar", error.message || "Não foi possível carregar as pessoas.");
        } finally { setLoading(false); }
    }, [codigoInstituicao, page, limit, filtrosAplicados, showToast]);

    useEffect(() => { load(); }, [load]);

    const loadGrupos = useCallback(async () => {
        if (!codigoInstituicao) return;
        try {
            const list = await apiGet<string[]>(
                `/instituicao/${codigoInstituicao}/pessoa/grupos`
            );
            setGruposDisponiveis(Array.isArray(list) ? list : []);
        } catch {
            setGruposDisponiveis([]);
        }
    }, [codigoInstituicao]);

    useEffect(() => {
        loadGrupos();
    }, [loadGrupos]);

    const loadMappings = useCallback(
        async (pescodigo: number) => {
            if (!codigoInstituicao) return;
            setLoadingMappings(true);
            try {
                const data = await apiGet<Mapeamento[]>(
                    `/instituicao/${codigoInstituicao}/pessoa/${pescodigo}/mappings`
                );
                setMappings(data);
            } catch (error: any) {
                showToast(
                    "error",
                    "Erro ao carregar mapeamentos",
                    error.message || "Não foi possível carregar os IDs de hardware."
                );
            } finally {
                setLoadingMappings(false);
            }
        },
        [codigoInstituicao, showToast]
    );

    const openNew = () => {
        setForm({
            PESNome: "",
            PESDocumento: "",
            PESEmail: "",
            PESCelular: "",
            PESCartaoTag: "",
            PESLimiarFacial: 680,
            PESGemeo: false,
        });
        personModal.openModal();
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/instituicao/${codigoInstituicao}/pessoa/${editing.PESCodigo}`, form);
                showToast("success", "Pessoa atualizada", "Os dados foram salvos com sucesso.");
            } else {
                await apiPost(`/instituicao/${codigoInstituicao}/pessoa`, form);
                showToast("success", "Pessoa criada", "O novo registro foi cadastrado com sucesso.");
            }
            personModal.closeModal();
            load();
            loadGrupos();
        } catch (error: any) {
            showToast("error", "Erro ao salvar", error.message || "Ocorreu um erro ao processar a solicitação.");
        } finally { setSaving(false); }
    };

    const handleDeactivateClick = (p: Pessoa) => {
        setDeactivateTarget(p);
        deactivateModal.openModal();
    };

    const confirmDeactivate = async () => {
        if (!deactivateTarget) return;
        setSaving(true);
        try {
            await apiDelete(`/instituicao/${codigoInstituicao}/pessoa/${deactivateTarget.PESCodigo}`);
            showToast("success", "Pessoa desativada", "O registro foi desativado com sucesso.");
            deactivateModal.closeModal();
            load();
            loadGrupos();
        } catch (error: any) {
            showToast("error", "Erro ao desativar", error.message || "Não foi possível desativar a pessoa.");
        } finally { setSaving(false); }
    };

    const handleMappingClick = async (p: Pessoa) => {
        setMappingTarget(p);
        setMappings([]);
        mappingModal.openModal();
        await loadMappings(p.PESCodigo);
    };

    const handleSyncPersonHardware = async () => {
        if (!codigoInstituicao || !mappingTarget) return;
        setSyncingPerson(true);
        try {
            const res = await apiPost<{
                synced: number;
                failed: number;
                results: Array<{ equipmentId: number; ok: boolean; error?: string }>;
            }>(
                `/instituicao/${codigoInstituicao}/hardware/person/${mappingTarget.PESCodigo}/sync`,
                {}
            );
            if (res.failed > 0) {
                showToast(
                    "warning",
                    "Sincronização parcial",
                    `${res.synced} equipamento(s) OK, ${res.failed} com falha.`
                );
            } else {
                showToast(
                    "success",
                    "Pessoa sincronizada",
                    res.synced === 0
                        ? "Nenhum equipamento ativo para sincronizar."
                        : `${res.synced} equipamento(s) atualizado(s).`
                );
            }
            await loadMappings(mappingTarget.PESCodigo);
        } catch (error: any) {
            showToast(
                "error",
                "Erro na sincronização",
                error.message || "Não foi possível sincronizar a pessoa nos equipamentos."
            );
        } finally {
            setSyncingPerson(false);
        }
    };

    /** Fecha o modal de mapeamento antes do de confirmação para o overlay aparecer corretamente. */
    const openDeleteFromDevicesConfirm = () => {
        mappingModal.closeModal();
        deleteFromDevicesModal.openModal();
    };

    /** Ao cancelar confirmação, volta ao modal de mapeamento. */
    const handleCloseDeleteFromDevicesModal = () => {
        deleteFromDevicesModal.closeModal();
        if (mappingTarget) {
            mappingModal.openModal();
        }
    };

    const confirmDeleteFromDevices = async () => {
        if (!codigoInstituicao || !mappingTarget) return;
        setDeletingFromDevices(true);
        try {
            const res = await apiPost<{
                deleted: number;
                failed: number;
                mappingsRemoved: number;
                results: Array<{ equipmentId: number; ok: boolean; error?: string }>;
            }>(
                `/instituicao/${codigoInstituicao}/hardware/person/${mappingTarget.PESCodigo}/delete-from-devices`,
                {}
            );
            if (res.failed > 0) {
                showToast(
                    "warning",
                    "Exclusão parcial",
                    `${res.deleted} equipamento(s) OK, ${res.failed} com falha. ` +
                        `${res.mappingsRemoved} mapeamento(s) removido(s) no sistema.`
                );
            } else {
                showToast(
                    "success",
                    "Exclusão concluída",
                    res.deleted === 0
                        ? "Nenhum equipamento ativo. Mapeamentos locais limpos."
                        : `Removido em ${res.deleted} equipamento(s). ` +
                          `${res.mappingsRemoved} mapeamento(s) removido(s) no sistema.`
                );
            }
            deleteFromDevicesModal.closeModal();
            await loadMappings(mappingTarget.PESCodigo);
            mappingModal.openModal();
        } catch (error: any) {
            showToast(
                "error",
                "Erro ao excluir nos equipamentos",
                error.message || "Não foi possível remover a pessoa dos equipamentos."
            );
        } finally {
            setDeletingFromDevices(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Pessoas</h2>
                {can("pessoa", "create") && (
                    <Button size="sm" onClick={openNew}>+ Nova Pessoa</Button>
                )}
            </div>

            <PessoasFiltros
                aplicados={filtrosAplicados}
                gruposDisponiveis={gruposDisponiveis}
                onAplicar={(f) => {
                    setFiltrosAplicados(f);
                    setPage(1);
                }}
                onLimpar={() => {
                    setFiltrosAplicados(PESSOA_FILTROS_VAZIOS);
                    setPage(1);
                }}
            />

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Nome</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Documento</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Email</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Tag</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : pessoas.length === 0 ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Nenhuma pessoa encontrada.</td></tr>
                        ) : pessoas.map((p) => (
                            <tr
                                key={p.PESCodigo}
                                onClick={() => {
                                    if (can("pessoa", "update")) {
                                        router.push(`/instituicao/${codigoInstituicao}/pessoas/${p.PESCodigo}/edit`);
                                    }
                                }}
                                className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors ${can("pessoa", "update") ? "cursor-pointer" : ""}`}
                            >
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-center">
                                            {p.PESFotoBase64 ? (
                                                <img
                                                    src={`data:image/${p.PESFotoExtensao || 'png'};base64,${p.PESFotoBase64}`}
                                                    alt={p.PESNome}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <UserCircleIcon className="w-6 h-6 text-gray-400" />
                                            )}
                                        </div>
                                        <span className="font-medium">{p.PESNome}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.PESDocumento || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.PESEmail || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{p.PESCartaoTag || "—"}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${p.PESAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{p.PESAtivo ? "Ativa" : "Inativa"}</span>
                                </td>
                                <td className="px-5 py-3 flex gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleMappingClick(p);
                                        }}
                                        className="text-xs text-brand-500 hover:underline px-2 py-1 rounded bg-brand-50 dark:bg-brand-900/10"
                                    >
                                        Mapeamento
                                    </button>
                                    {can("pessoa", "delete") && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeactivateClick(p);
                                            }}
                                            className="text-xs text-red-500 hover:underline px-2 py-1"
                                        >
                                            Desativar
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
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
                    </select>
                </div>

                {meta.totalPages > 1 && (
                    <PaginationWithIcon
                        totalPages={meta.totalPages}
                        initialPage={page}
                        onPageChange={(p) => setPage(p)}
                    />
                )}

                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total: {meta.total} registros
                </p>
            </div>

            {/* Person Modal */}
            <Modal
                isOpen={personModal.isOpen}
                onClose={personModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Nova Pessoa
                    </h3>
                    <div className="space-y-3">
                        <input placeholder="Nome *" value={form.PESNome} onChange={(e) => setForm({ ...form, PESNome: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Documento (CPF)" value={form.PESDocumento} onChange={(e) => setForm({ ...form, PESDocumento: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Email" value={form.PESEmail} onChange={(e) => setForm({ ...form, PESEmail: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Celular" value={form.PESCelular} onChange={(e) => setForm({ ...form, PESCelular: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <input placeholder="Cartão/Tag" value={form.PESCartaoTag} onChange={(e) => setForm({ ...form, PESCartaoTag: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none" />
                        <LimiarFacialSlider
                            id="modal-pessoa-limiar"
                            label="Limiar facial"
                            value={form.PESLimiarFacial}
                            onChange={(n) => setForm({ ...form, PESLimiarFacial: n })}
                            disabled={saving}
                        />
                        <div className="flex items-center gap-3 pt-1">
                            <input
                                id="modal-PESGemeo"
                                type="checkbox"
                                checked={form.PESGemeo}
                                onChange={(e) => setForm({ ...form, PESGemeo: e.target.checked })}
                                disabled={saving}
                                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800"
                            />
                            <label htmlFor="modal-PESGemeo" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                                Gemeo?
                            </label>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={personModal.closeModal}>Cancelar</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving || !form.PESNome}>
                            {saving ? "Salvando..." : "Salvar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Deactivation Modal */}
            <Modal
                isOpen={deactivateModal.isOpen}
                onClose={deactivateModal.closeModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Confirmar Desativação</h3>
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10">
                        <div className="flex-shrink-0">
                            <AlertIcon className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Atenção!</h4>
                            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400/80">
                                Deseja realmente desativar o registro de <strong>{deactivateTarget?.PESNome}</strong>?
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button size="sm" variant="outline" onClick={deactivateModal.closeModal}>Cancelar</Button>
                        <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white border-transparent" onClick={confirmDeactivate} disabled={saving}>
                            {saving ? "Desativando..." : "Sim, Desativar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Mapping Modal */}
            <Modal
                isOpen={mappingModal.isOpen}
                onClose={mappingModal.closeModal}
                className="max-w-lg p-6"
            >
                <div className="space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            Mapeamento de Hardware
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            IDs de <strong>{mappingTarget?.PESNome}</strong> nos equipamentos sincronizados.
                        </p>
                    </div>

                    <div className="mt-4 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-white/[0.02]">
                                <tr>
                                    <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Equipamento</th>
                                    <th className="px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-center">ID no Hardware</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {loadingMappings ? (
                                    <tr>
                                        <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                                            Carregando IDs...
                                        </td>
                                    </tr>
                                ) : mappings.length === 0 ? (
                                    <tr>
                                        <td colSpan={2} className="px-4 py-8 text-center text-gray-400">
                                            Nenhum mapeamento encontrado.
                                        </td>
                                    </tr>
                                ) : (
                                    mappings.map((m) => (
                                        <tr key={m.PEQCodigo}>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-800 dark:text-white/90">
                                                    {m.equipamento.EQPDescricao}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {m.equipamento.EQPMarca} - {m.equipamento.EQPModelo}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                                                    {m.PEQIdNoEquipamento}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end gap-3 pt-2 flex-wrap">
                        {can("equipamento", "update") && mappingTarget && (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleSyncPersonHardware}
                                    disabled={
                                        syncingPerson ||
                                        deletingFromDevices ||
                                        loadingMappings
                                    }
                                >
                                    {syncingPerson ? "Sincronizando..." : "Sincronizar Pessoa"}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
                                    onClick={openDeleteFromDevicesConfirm}
                                    disabled={
                                        syncingPerson ||
                                        deletingFromDevices ||
                                        loadingMappings
                                    }
                                >
                                    Excluir nos equipamentos
                                </Button>
                            </>
                        )}
                        <Button
                            size="sm"
                            onClick={mappingModal.closeModal}
                            disabled={deletingFromDevices || syncingPerson}
                        >
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Excluir dos equipamentos — confirmação (abre após fechar o modal de mapeamento; vem depois no DOM para ficar por cima) */}
            <Modal
                isOpen={deleteFromDevicesModal.isOpen}
                onClose={handleCloseDeleteFromDevicesModal}
                className="max-w-md p-6"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Excluir nos equipamentos
                    </h3>
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10">
                        <div className="flex-shrink-0">
                            <AlertIcon className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400">Atenção</h4>
                            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400/80">
                                O cadastro de{" "}
                                <strong>{mappingTarget?.PESNome}</strong> será removido de{" "}
                                <strong>todos os equipamentos ativos</strong> desta instituição.
                                Os vínculos de mapeamento no sistema também serão apagados.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end pt-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCloseDeleteFromDevicesModal}
                            disabled={deletingFromDevices}
                        >
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white border-transparent"
                            onClick={confirmDeleteFromDevices}
                            disabled={deletingFromDevices}
                        >
                            {deletingFromDevices ? "Excluindo..." : "Confirmar exclusão"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
