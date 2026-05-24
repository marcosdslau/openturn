"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/context/ToastContext";
import { apiPost, apiPut } from "@/lib/api";
import type { PeriodoRegistro } from "./aglutinacao-types";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    instituicaoId: string;
    periodo: PeriodoRegistro | null;
    onSaved: (saved: PeriodoRegistro) => void;
}

const EMPTY: PeriodoRegistro = {
    PERNome: "",
    PERHorarioInicio: "",
    PERHorarioFim: "",
    PERToleranciaEntradaMinutos: 0,
    PERToleranciaSaidaMinutos: 0,
};

export default function PeriodoRegistroModal({ isOpen, onClose, instituicaoId, periodo, onSaved }: Props) {
    const { showToast } = useToast();
    const [form, setForm] = useState<PeriodoRegistro>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setForm(periodo ?? EMPTY);
            setFieldError(null);
        }
    }, [isOpen, periodo]);

    const set = (key: keyof PeriodoRegistro, value: string | number) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const validate = (): string | null => {
        if (!form.PERNome.trim()) return "Nome é obrigatório.";
        if (form.PERNome.length > 80) return "Nome deve ter no máximo 80 caracteres.";
        if (!form.PERHorarioInicio) return "Horário de início é obrigatório.";
        if (!form.PERHorarioFim) return "Horário de fim é obrigatório.";
        if (form.PERHorarioInicio === form.PERHorarioFim) return "Horário de início e fim não podem ser iguais.";
        if (form.PERToleranciaEntradaMinutos < 0) return "Tolerância de entrada não pode ser negativa.";
        if (form.PERToleranciaSaidaMinutos < 0) return "Tolerância de saída não pode ser negativa.";
        return null;
    };

    const handleSubmit = async () => {
        const err = validate();
        if (err) { setFieldError(err); return; }
        setFieldError(null);
        setSaving(true);

        const payload = {
            PERNome: form.PERNome.trim(),
            PERHorarioInicio: form.PERHorarioInicio,
            PERHorarioFim: form.PERHorarioFim,
            PERToleranciaEntradaMinutos: Number(form.PERToleranciaEntradaMinutos),
            PERToleranciaSaidaMinutos: Number(form.PERToleranciaSaidaMinutos),
        };

        try {
            let saved: PeriodoRegistro;
            if (form.PERCodigo) {
                saved = await apiPut<PeriodoRegistro>(
                    `/instituicao/${instituicaoId}/periodos-registro/${form.PERCodigo}`,
                    payload,
                );
            } else {
                saved = await apiPost<PeriodoRegistro>(
                    `/instituicao/${instituicaoId}/periodos-registro`,
                    payload,
                );
            }
            showToast("success", form.PERCodigo ? "Período atualizado." : "Período adicionado.");
            onSaved(saved);
            onClose();
        } catch (err: any) {
            const body = err?.response?.data ?? err?.data ?? err;
            if (body?.code === "PERIODO_OVERLAP" || body?.statusCode === 400) {
                const msg: string = body?.message ?? "Há sobreposição com outro período cadastrado.";
                setFieldError(msg);
                showToast("error", "Sobreposição de horário", msg);
            } else {
                showToast("error", "Erro ao salvar período.", err?.message ?? "Tente novamente.");
            }
        } finally {
            setSaving(false);
        }
    };

    const timeInputClass =
        "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-md rounded-2xl p-6">
            <h4 className="mb-5 text-base font-semibold text-gray-800 dark:text-white/90">
                {form.PERCodigo ? "Editar período" : "Adicionar período"}
            </h4>

            <div className="space-y-4">
                <div>
                    <Label htmlFor="perNome">Nome</Label>
                    <InputField
                        id="perNome"
                        value={form.PERNome}
                        onChange={(e) => set("PERNome", e.target.value)}
                        placeholder="Ex.: Manhã"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="perInicio">Horário início</Label>
                        <input
                            id="perInicio"
                            type="time"
                            value={form.PERHorarioInicio}
                            onChange={(e) => set("PERHorarioInicio", e.target.value)}
                            className={timeInputClass}
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="perFim">Horário fim</Label>
                        <input
                            id="perFim"
                            type="time"
                            value={form.PERHorarioFim}
                            onChange={(e) => set("PERHorarioFim", e.target.value)}
                            className={timeInputClass}
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="perTolE">Tolerância entrada (min)</Label>
                        <InputField
                            id="perTolE"
                            type="number"
                            min="0"
                            value={String(form.PERToleranciaEntradaMinutos)}
                            onChange={(e) => set("PERToleranciaEntradaMinutos", parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="perTolS">Tolerância saída (min)</Label>
                        <InputField
                            id="perTolS"
                            type="number"
                            min="0"
                            value={String(form.PERToleranciaSaidaMinutos)}
                            onChange={(e) => set("PERToleranciaSaidaMinutos", parseInt(e.target.value) || 0)}
                        />
                    </div>
                </div>

                {fieldError && (
                    <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-900/20 dark:text-error-400">
                        {fieldError}
                    </p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <Button size="sm" variant="outline" onClick={onClose} type="button">
                        Cancelar
                    </Button>
                    <Button size="sm" type="button" disabled={saving} onClick={handleSubmit}>
                        {saving ? "Salvando…" : "Salvar"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
