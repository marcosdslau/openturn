"use client";

import React from "react";
import type { PeriodoRegistro } from "./aglutinacao-types";

interface Props {
    periodos: PeriodoRegistro[];
    onAdd: () => void;
    onEdit: (periodo: PeriodoRegistro) => void;
    onDelete: (perCodigo: number) => void;
}

export default function PeriodosRegistroList({ periodos, onAdd, onEdit, onDelete }: Props) {
    const handleDelete = (p: PeriodoRegistro) => {
        if (!p.PERCodigo) return;
        if (!window.confirm(`Remover o período "${p.PERNome}"?`)) return;
        onDelete(p.PERCodigo);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Períodos configurados
                </p>
                <button
                    type="button"
                    onClick={onAdd}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-400 dark:hover:bg-brand-900/40"
                >
                    <span className="text-base leading-none">+</span>
                    Adicionar período
                </button>
            </div>

            {periodos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                    Nenhum período cadastrado. Clique em &quot;Adicionar período&quot; para começar.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                {["Nome", "Início", "Fim", "Tol. Entrada", "Tol. Saída", ""].map((h) => (
                                    <th
                                        key={h}
                                        className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700/50 dark:bg-transparent">
                            {periodos.map((p, idx) => (
                                <tr key={p.PERCodigo ?? idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-white/90">
                                        {p.PERNome}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-gray-600 dark:text-gray-300">
                                        {p.PERHorarioInicio}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-gray-600 dark:text-gray-300">
                                        {p.PERHorarioFim}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                                        {p.PERToleranciaEntradaMinutos} min
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                                        {p.PERToleranciaSaidaMinutos} min
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onEdit(p)}
                                                className="rounded p-1 text-gray-400 transition hover:text-brand-600 dark:hover:text-brand-400"
                                                title="Editar"
                                            >
                                                <PencilIcon />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(p)}
                                                className="rounded p-1 text-gray-400 transition hover:text-error-500 dark:hover:text-error-400"
                                                title="Excluir"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function PencilIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 011-1h4a1 1 0 011 1m-7 0H5m14 0h-2" />
        </svg>
    );
}
