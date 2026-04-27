"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDownIcon } from "@/icons";

export interface SearchableMultiSelectOption {
    value: string;
    label: string;
}

interface SearchableMultiSelectProps {
    options: SearchableMultiSelectOption[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    label: string;
    className?: string;
    disabled?: boolean;
    /** Máx. de chips visíveis no gatilho; o restante vira +N (default 2) */
    maxChipsPreview?: number;
}

/**
 * Seleção múltipla com busca, no mesmo padrão visual de {@link SearchableSelect} (TailAdmin no projeto).
 */
export default function SearchableMultiSelect({
    options,
    value,
    onChange,
    placeholder = "Selecione opções",
    label,
    className = "",
    disabled = false,
    maxChipsPreview = 2,
}: SearchableMultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);

    const filteredOptions = options.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleValue = (v: string) => {
        if (value.includes(v)) {
            onChange(value.filter((x) => x !== v));
        } else {
            onChange([...value, v]);
        }
    };

    const removeValue = (v: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(value.filter((x) => x !== v));
    };

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
        setIsOpen((o) => !o);
        if (!isOpen) setSearchTerm("");
    }, [disabled, isOpen]);

    const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;
    const preview = value.slice(0, maxChipsPreview);
    const rest = Math.max(0, value.length - maxChipsPreview);

    // z-index no root: quando aberto, o bloco inteiro fica acima dos irmãos no grid
    // (evita que o painel absoluto fique "atrás" dos inputs de Curso/Módulo/Turma abaixo).
    return (
        <div
            className={[
                "relative w-full min-w-0",
                isOpen ? "z-50" : "z-0",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            ref={rootRef}
        >
            <label
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
                id={`${label}-ms-label`}
            >
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
                        <span className="self-center text-gray-400 dark:text-gray-500">
                            {placeholder}
                        </span>
                    ) : (
                        <>
                            {preview.map((v) => (
                                <span
                                    key={v}
                                    className="inline-flex max-w-full items-center gap-0.5 rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-white/90"
                                >
                                    <span className="truncate">{labelFor(v)}</span>
                                    <span
                                        role="button"
                                        tabIndex={-1}
                                        onClick={(e) => removeValue(v, e)}
                                        className="shrink-0 cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                    >
                                        ×
                                    </span>
                                </span>
                            ))}
                            {rest > 0 && (
                                <span className="self-center text-xs text-gray-500">
                                    +{rest}
                                </span>
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
                            placeholder="Pesquisar..."
                            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                        />
                    </div>
                    <ul
                        className="custom-scrollbar max-h-60 overflow-y-auto py-1"
                        role="listbox"
                        aria-multiselectable
                    >
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => {
                                const selected = value.includes(opt.value);
                                return (
                                    <li key={opt.value} role="option" aria-selected={selected}>
                                        <button
                                            type="button"
                                            onClick={() => toggleValue(opt.value)}
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
                                                    <svg
                                                        className="h-2.5 w-2.5"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2.5}
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                )}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">
                                                {opt.label}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })
                        ) : (
                            <li className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhum resultado encontrado.
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
