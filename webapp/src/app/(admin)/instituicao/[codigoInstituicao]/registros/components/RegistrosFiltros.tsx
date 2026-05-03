"use client";

import { useState } from "react";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { ChevronDownIcon } from "@/icons";

export type RegistrosFiltrosAplicados = {
    nome: string;
    documento: string;
    grupo: string;
    MATCurso: string;
    MATSerie: string;
    MATTurma: string;
    dataInicio: string;
    dataFim: string;
};

export const REGISTROS_FILTROS_VAZIOS: RegistrosFiltrosAplicados = {
    nome: "",
    documento: "",
    grupo: "",
    MATCurso: "",
    MATSerie: "",
    MATTurma: "",
    dataInicio: "",
    dataFim: "",
};

export function buildRegistrosQuery(page: number, limit: number, f: RegistrosFiltrosAplicados): string {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (f.nome.trim()) p.set("nome", f.nome.trim());
    if (f.documento.trim()) p.set("documento", f.documento.trim());
    if (f.grupo.trim()) p.set("grupo", f.grupo.trim());
    if (f.MATCurso.trim()) p.set("MATCurso", f.MATCurso.trim());
    if (f.MATSerie.trim()) p.set("MATSerie", f.MATSerie.trim());
    if (f.MATTurma.trim()) p.set("MATTurma", f.MATTurma.trim());
    if (f.dataInicio) p.set("dataInicio", f.dataInicio);
    if (f.dataFim) p.set("dataFim", f.dataFim);
    return p.toString();
}

interface Props {
    aplicados: RegistrosFiltrosAplicados;
    onAplicar: (f: RegistrosFiltrosAplicados) => void;
    onLimpar: () => void;
}

export default function RegistrosFiltros({ aplicados, onAplicar, onLimpar }: Props) {
    const [draft, setDraft] = useState<RegistrosFiltrosAplicados>(aplicados);
    const [aberto, setAberto] = useState(false);

    const temFiltros = Object.values(aplicados).some((v) => !!v);

    const set = (key: keyof RegistrosFiltrosAplicados, val: string) =>
        setDraft((prev) => ({ ...prev, [key]: val }));

    const aplicar = () => { onAplicar(draft); setAberto(false); };
    const limpar = () => { const z = REGISTROS_FILTROS_VAZIOS; setDraft(z); onLimpar(); setAberto(false); };

    return (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <button
                type="button"
                onClick={() => setAberto(!aberto)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors rounded-xl"
            >
                <span className="flex items-center gap-2">
                    Filtros
                    {temFiltros && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                            {Object.values(aplicados).filter(Boolean).length}
                        </span>
                    )}
                </span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
            </button>

            {aberto && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                            <Label>Nome</Label>
                            <InputField placeholder="Buscar por nome..." value={draft.nome} onChange={(e) => set("nome", e.target.value)} />
                        </div>
                        <div>
                            <Label>Documento (CPF)</Label>
                            <InputField placeholder="000.000.000-00" value={draft.documento} onChange={(e) => set("documento", e.target.value)} />
                        </div>
                        <div>
                            <Label>Grupo</Label>
                            <InputField placeholder="Ex: Aluno" value={draft.grupo} onChange={(e) => set("grupo", e.target.value)} />
                        </div>
                        <div>
                            <Label>Curso</Label>
                            <InputField placeholder="Ex: Administração" value={draft.MATCurso} onChange={(e) => set("MATCurso", e.target.value)} />
                        </div>
                        <div>
                            <Label>Série / Período</Label>
                            <InputField placeholder="Ex: 3º Ano" value={draft.MATSerie} onChange={(e) => set("MATSerie", e.target.value)} />
                        </div>
                        <div>
                            <Label>Turma</Label>
                            <InputField placeholder="Ex: A" value={draft.MATTurma} onChange={(e) => set("MATTurma", e.target.value)} />
                        </div>
                        <div>
                            <Label>Data Início</Label>
                            <InputField type="date" value={draft.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} />
                        </div>
                        <div>
                            <Label>Data Fim</Label>
                            <InputField type="date" value={draft.dataFim} onChange={(e) => set("dataFim", e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button size="sm" onClick={aplicar}>Aplicar Filtros</Button>
                        {temFiltros && (
                            <Button size="sm" variant="outline" onClick={limpar}>Limpar</Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
