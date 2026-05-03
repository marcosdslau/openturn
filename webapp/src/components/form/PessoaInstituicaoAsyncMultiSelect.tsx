"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/icons";
import { apiGet } from "@/lib/api";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

export type PessoaRow = {
    PESCodigo: number;
    PESNome: string;
    PESNomeSocial?: string | null;
};

interface PessoaListResponse {
    data: PessoaRow[];
    meta: { total: number; page: number; limit: number; totalPages: number };
}

function labelPessoa(p: PessoaRow): string {
    const s = p.PESNomeSocial?.trim();
    return s || p.PESNome;
}

function buildPessoaQuery(instituicaoCodigo: number, page: number, nome: string): string {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
    });
    if (nome) params.set("nome", nome);
    return `/instituicao/${instituicaoCodigo}/pessoa?${params}`;
}

export interface PessoaInstituicaoAsyncMultiSelectProps {
    instituicaoCodigo: number;
    value: number[];
    onChange: (ids: number[]) => void;
    label: string;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    maxChipsPreview?: number;
}

export default function PessoaInstituicaoAsyncMultiSelect({
    instituicaoCodigo,
    value,
    onChange,
    label,
    placeholder = "Selecione pessoas ou deixe vazio para todas",
    className = "",
    disabled = false,
    maxChipsPreview = 2,
}: PessoaInstituicaoAsyncMultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchInput, setSearchInput] = useState("");
    const [searchDebounced, setSearchDebounced] = useState("");

    const [rows, setRows] = useState<PessoaRow[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingInitial, setLoadingInitial] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nomePorCodigo, setNomePorCodigo] = useState<Record<number, string>>({});

    const rootRef = useRef<HTMLDivElement>(null);
    const fetchGenRef = useRef(0);
    const searchDebouncedRef = useRef("");
    const loadingMoreRef = useRef(false);
    const pageRef = useRef(1);
    const totalPagesRef = useRef(1);

    useEffect(() => {
        pageRef.current = page;
    }, [page]);

    useEffect(() => {
        totalPagesRef.current = totalPages;
    }, [totalPages]);

    useEffect(() => {
        searchDebouncedRef.current = searchDebounced;
    }, [searchDebounced]);

    const mergeNomes = useCallback((lista: PessoaRow[]) => {
        if (lista.length === 0) return;
        setNomePorCodigo((prev) => {
            const next = { ...prev };
            for (const r of lista) {
                next[r.PESCodigo] = labelPessoa(r);
            }
            return next;
        });
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const t = window.setTimeout(() => {
            setSearchDebounced(searchInput.trim());
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(t);
    }, [searchInput, isOpen]);

    useEffect(() => {
        if (!isOpen || !instituicaoCodigo) return;
        const gen = ++fetchGenRef.current;
        let cancelled = false;

        (async () => {
            setLoadingInitial(true);
            setRows([]);
            setPage(1);
            try {
                const res = await apiGet<PessoaListResponse>(
                    buildPessoaQuery(instituicaoCodigo, 1, searchDebounced),
                );
                if (cancelled || gen !== fetchGenRef.current) return;
                const list = res.data ?? [];
                setRows(list);
                mergeNomes(list);
                const tp = Math.max(1, res.meta?.totalPages ?? 1);
                setTotalPages(tp);
                totalPagesRef.current = tp;
                pageRef.current = 1;
            } catch {
                if (!cancelled && gen === fetchGenRef.current) {
                    setRows([]);
                    setTotalPages(1);
                }
            } finally {
                if (!cancelled && gen === fetchGenRef.current) setLoadingInitial(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isOpen, searchDebounced, instituicaoCodigo, mergeNomes]);

    const appendNextPage = useCallback(async () => {
        if (!instituicaoCodigo || loadingMoreRef.current || loadingInitial) return;
        const p = pageRef.current;
        const tp = totalPagesRef.current;
        if (p >= tp) return;
        const nextPage = p + 1;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        try {
            const res = await apiGet<PessoaListResponse>(
                buildPessoaQuery(instituicaoCodigo, nextPage, searchDebouncedRef.current),
            );
            const extra = res.data ?? [];
            setRows((prev) => {
                const seen = new Set(prev.map((r) => r.PESCodigo));
                const add = extra.filter((r) => !seen.has(r.PESCodigo));
                if (add.length) mergeNomes(add);
                return [...prev, ...add];
            });
            setPage(nextPage);
            pageRef.current = nextPage;
            const newTp = Math.max(1, res.meta?.totalPages ?? 1);
            setTotalPages(newTp);
            totalPagesRef.current = newTp;
        } catch {
            /* keep lista atual */
        } finally {
            loadingMoreRef.current = false;
            setLoadingMore(false);
        }
    }, [instituicaoCodigo, loadingInitial, mergeNomes]);

    const onListScroll = useCallback(
        (e: React.UIEvent<HTMLUListElement>) => {
            const el = e.currentTarget;
            if (loadingInitial || loadingMore) return;
            if (pageRef.current >= totalPagesRef.current) return;
            const threshold = 48;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
                void appendNextPage();
            }
        },
        [appendNextPage, loadingInitial, loadingMore],
    );

    useEffect(() => {
        if (!isOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", onDoc, true);
        return () => document.removeEventListener("mousedown", onDoc, true);
    }, [isOpen]);

    const openToggle = useCallback(() => {
        if (disabled) return;
        setIsOpen((was) => {
            const next = !was;
            if (next) {
                setSearchInput("");
                setSearchDebounced("");
            }
            return next;
        });
    }, [disabled]);

    const toggleId = (r: PessoaRow) => {
        const id = r.PESCodigo;
        const nome = labelPessoa(r);
        if (value.includes(id)) {
            onChange(value.filter((x) => x !== id));
        } else {
            setNomePorCodigo((prev) => ({ ...prev, [id]: nome }));
            onChange([...value, id]);
        }
    };

    const removeValue = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(value.filter((x) => x !== id));
    };

    const nameForId = (id: number) => nomePorCodigo[id] ?? `#${id}`;

    const preview = value.slice(0, maxChipsPreview);
    const rest = Math.max(0, value.length - maxChipsPreview);

    return (
        <div
            className={["relative w-full min-w-0", isOpen ? "z-[200]" : "z-0", className].filter(Boolean).join(" ")}
            ref={rootRef}
        >
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400" id={`${label}-pess-async-label`}>
                {label}
            </label>

            <button
                type="button"
                onClick={openToggle}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className="flex min-h-11 w-full items-start justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-theme-xs transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800/80"
            >
                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {value.length === 0 ? (
                        <span className="self-center text-gray-400 dark:text-gray-500">{placeholder}</span>
                    ) : (
                        <>
                            {preview.map((id) => (
                                <span
                                    key={id}
                                    className="inline-flex max-w-full items-center gap-0.5 rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90"
                                >
                                    <span className="truncate">{nameForId(id)}</span>
                                    <span
                                        role="button"
                                        tabIndex={-1}
                                        onClick={(e) => removeValue(id, e)}
                                        className="shrink-0 cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                    >
                                        ×
                                    </span>
                                </span>
                            ))}
                            {rest > 0 && (
                                <span className="self-center text-xs text-gray-500">+{rest}</span>
                            )}
                        </>
                    )}
                </span>
                <ChevronDownIcon
                    className={`mt-0.5 h-4 w-4 shrink-0 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
            </button>

            {isOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
                    <div className="border-b border-gray-100 p-3 dark:border-gray-800">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Pesquisar por nome..."
                            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    </div>
                    <ul
                        className="custom-scrollbar max-h-60 overflow-y-auto py-1"
                        role="listbox"
                        aria-multiselectable
                        onScroll={onListScroll}
                    >
                        {loadingInitial ? (
                            <li className="px-4 py-6 text-center text-sm text-gray-400">Carregando...</li>
                        ) : rows.length === 0 ? (
                            <li className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhuma pessoa encontrada.
                            </li>
                        ) : (
                            <>
                                {rows.map((r) => {
                                    const selected = value.includes(r.PESCodigo);
                                    const lb = labelPessoa(r);
                                    return (
                                        <li key={r.PESCodigo} role="option" aria-selected={selected}>
                                            <button
                                                type="button"
                                                onClick={() => toggleId(r)}
                                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
                                            >
                                                <span
                                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                                        selected
                                                            ? "border-brand-500 bg-brand-500 text-white"
                                                            : "border-gray-300 dark:border-gray-600"
                                                    }`}
                                                >
                                                    {selected && (
                                                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate">{lb}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                                {loadingMore && (
                                    <li className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                                        Carregando mais...
                                    </li>
                                )}
                                {!loadingMore && page < totalPages && rows.length > 0 && (
                                    <li className="px-3 py-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
                                        Role para carregar mais
                                    </li>
                                )}
                            </>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
