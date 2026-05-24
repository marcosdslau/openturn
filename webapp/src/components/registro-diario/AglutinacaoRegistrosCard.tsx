"use client";

import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { useToast } from "@/context/ToastContext";
import { apiDelete } from "@/lib/api";
import {
    AGLUTINACAO_OPTIONS,
    AGLUTINACAO_DESCRICAO,
    type TipoAglutinacaoRegistro,
    type PeriodoRegistro,
} from "./aglutinacao-types";
import AglutinacaoIllustration from "./AglutinacaoIllustration";
import PeriodosRegistroList from "./PeriodosRegistroList";
import PeriodoRegistroModal from "./PeriodoRegistroModal";

interface Props {
    instituicaoId: string;
    tipo: TipoAglutinacaoRegistro;
    periodos: PeriodoRegistro[];
    onTipoChange: (tipo: TipoAglutinacaoRegistro) => void;
    onPeriodosChange: (periodos: PeriodoRegistro[]) => void;
}

export default function AglutinacaoRegistrosCard({
    instituicaoId,
    tipo,
    periodos,
    onTipoChange,
    onPeriodosChange,
}: Props) {
    const { showToast } = useToast();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingPeriodo, setEditingPeriodo] = useState<PeriodoRegistro | null>(null);

    const handleAdd = () => {
        setEditingPeriodo(null);
        setModalOpen(true);
    };

    const handleEdit = (p: PeriodoRegistro) => {
        setEditingPeriodo(p);
        setModalOpen(true);
    };

    const handleSaved = (saved: PeriodoRegistro) => {
        onPeriodosChange(
            editingPeriodo
                ? periodos.map((p) => (p.PERCodigo === saved.PERCodigo ? saved : p))
                : [...periodos, saved],
        );
    };

    const handleDelete = async (perCodigo: number) => {
        try {
            await apiDelete(`/instituicao/${instituicaoId}/periodos-registro/${perCodigo}`);
            onPeriodosChange(periodos.filter((p) => p.PERCodigo !== perCodigo));
            showToast("success", "Período removido.");
        } catch {
            showToast("error", "Erro ao remover período.", "Tente novamente.");
        }
    };

    return (
        <>
            <ComponentCard
                title="Aglutinação de Registros Diários"
                desc="Define como passagens brutas são convertidas em registros de presença diários."
            >
                <div className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                            Tipo de aglutinação
                        </label>
                        <div className="relative">
                            <select
                                value={tipo}
                                onChange={(e) => onTipoChange(e.target.value as TipoAglutinacaoRegistro)}
                                className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
                            >
                                {AGLUTINACAO_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value} className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                                <ChevronDownIcon />
                            </span>
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            {AGLUTINACAO_DESCRICAO[tipo]}
                        </p>
                    </div>

                    <AglutinacaoIllustration tipo={tipo} periodos={periodos} />

                    {tipo === "tempo_permanencia_periodo" && (
                        <PeriodosRegistroList
                            periodos={periodos}
                            onAdd={handleAdd}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    )}
                </div>
            </ComponentCard>

            <PeriodoRegistroModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                instituicaoId={instituicaoId}
                periodo={editingPeriodo}
                onSaved={handleSaved}
            />
        </>
    );
}

function ChevronDownIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
    );
}
