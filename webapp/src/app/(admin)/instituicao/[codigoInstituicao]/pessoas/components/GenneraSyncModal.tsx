"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/context/TenantContext";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import Button from "@/components/ui/button/Button";
import Switch from "@/components/form/switch/Switch";
import { Modal } from "@/components/ui/modal";

interface GenneraSearchPerson {
    idPerson: number;
    personName: string;
    document?: string | null;
    email?: string | null;
    active?: boolean;
}

interface GenneraSyncResult {
    message: string;
    created?: number;
    updated?: number;
    failed?: number;
    errors?: { idPerson: number; error: string }[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    onSyncStateChange?: (syncing: boolean) => void;
}

export default function GenneraSyncModal({
    isOpen,
    onClose,
    onSuccess,
    onSyncStateChange,
}: Props) {
    const { codigoInstituicao } = useTenant();
    const { showToast } = useToast();

    const [loadingErp, setLoadingErp] = useState(true);
    const [erpSistema, setErpSistema] = useState<string | null>(null);
    const [searchName, setSearchName] = useState("");
    const [searching, setSearching] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [results, setResults] = useState<GenneraSearchPerson[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [envioOnline, setEnvioOnline] = useState(true);

    const resetState = useCallback(() => {
        setSearchName("");
        setResults([]);
        setSelectedIds(new Set());
        setSearching(false);
        setSyncing(false);
        setEnvioOnline(true);
    }, []);

    useEffect(() => {
        if (!isOpen || !codigoInstituicao) return;

        resetState();
        setLoadingErp(true);

        apiGet<{ ERPSistema: string | null }>(
            `/instituicao/${codigoInstituicao}/pessoa/gennera/status`,
        )
            .then((res) => setErpSistema(res?.ERPSistema ?? null))
            .catch(() => setErpSistema(null))
            .finally(() => setLoadingErp(false));
    }, [isOpen, codigoInstituicao, resetState]);

    const isGennera = erpSistema === "Gennera";
    const allSelected =
        results.length > 0 && results.every((r) => selectedIds.has(r.idPerson));

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(results.map((r) => r.idPerson)));
        }
    };

    const toggleOne = (idPerson: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(idPerson)) next.delete(idPerson);
            else next.add(idPerson);
            return next;
        });
    };

    const handleSearch = async () => {
        if (!codigoInstituicao || !searchName.trim()) return;
        setSearching(true);
        try {
            const data = await apiGet<GenneraSearchPerson[]>(
                `/instituicao/${codigoInstituicao}/pessoa/gennera/search?name=${encodeURIComponent(searchName.trim())}`,
            );
            const list = Array.isArray(data) ? data : [];
            setResults(list);
            setSelectedIds(new Set());
            if (list.length === 0) {
                showToast("info", "Busca", "Nenhuma pessoa encontrada.");
            }
        } catch (error: any) {
            showToast("error", "Erro na busca", error.message || "Não foi possível buscar no Gennera.");
            setResults([]);
        } finally {
            setSearching(false);
        }
    };

    const handleSync = async () => {
        if (!codigoInstituicao || selectedIds.size === 0) return;
        setSyncing(true);
        onSyncStateChange?.(true);
        try {
            const res = await apiPost<GenneraSyncResult>(
                `/instituicao/${codigoInstituicao}/pessoa/gennera/sincronizar?envioOnline=${envioOnline}`,
                { idPersons: Array.from(selectedIds) },
            );
            showToast("success", "Sincronização", res.message || "Concluído.");
            onSuccess?.();
            onClose();
        } catch (error: any) {
            showToast(
                "error",
                "Erro na sincronização",
                error.message || "Não foi possível sincronizar as pessoas.",
            );
        } finally {
            setSyncing(false);
            onSyncStateChange?.(false);
        }
    };

    const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={syncing ? () => {} : onClose}
            className="max-w-3xl p-0 overflow-hidden"
        >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                    Sincronizar pessoas (Gennera)
                </h2>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
                {loadingErp ? (
                    <p className="text-sm text-gray-500">Carregando configuração ERP...</p>
                ) : !isGennera ? (
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            A sincronização de pessoas para o ERP{" "}
                            <strong>{erpSistema || "configurado"}</strong> será disponibilizada em breve.
                            No momento, esta funcionalidade está disponível apenas para{" "}
                            <strong>Gennera</strong>.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Digite o nome para pesquisar"
                                value={searchName}
                                onChange={(e) => setSearchName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleSearch();
                                }}
                                disabled={searching || syncing}
                                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-brand-500 focus:outline-none"
                            />
                            <Button
                                size="sm"
                                onClick={() => void handleSearch()}
                                disabled={searching || syncing || !searchName.trim()}
                            >
                                {searching ? "Pesquisando..." : "Pesquisar"}
                            </Button>
                        </div>

                        {results.length > 0 && (
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                            <th className="px-4 py-2 text-left w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={toggleAll}
                                                    disabled={syncing}
                                                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                                    aria-label="Selecionar todos"
                                                />
                                            </th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Documento</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map((person) => (
                                            <tr
                                                key={person.idPerson}
                                                className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                                            >
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(person.idPerson)}
                                                        onChange={() => toggleOne(person.idPerson)}
                                                        disabled={syncing}
                                                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-gray-800 dark:text-white/90">
                                                    {person.personName}
                                                </td>
                                                <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                                                    {person.document || "—"}
                                                </td>
                                                <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                                                    {person.email || "—"}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span
                                                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                                            person.active
                                                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                                        }`}
                                                    >
                                                        {person.active ? "Ativo" : "Inativo"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <div>
                    {isGennera && (
                        <Switch
                            key={String(isOpen)}
                            label="Envio online Sim/Não"
                            defaultChecked={true}
                            onChange={setEnvioOnline}
                            disabled={syncing}
                        />
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <Button size="sm" variant="outline" onClick={onClose} disabled={syncing}>
                        Fechar
                    </Button>
                    {isGennera && (
                        <Button
                            size="sm"
                            onClick={() => void handleSync()}
                            disabled={syncing || selectedCount === 0}
                        >
                            {syncing
                                ? "Sincronizando..."
                                : `Sincronizar selecionados (${selectedCount})`}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
