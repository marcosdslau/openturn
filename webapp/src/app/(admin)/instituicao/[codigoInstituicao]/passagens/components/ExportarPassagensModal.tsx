"use client";

import { useState } from "react";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import ExportarModal from "@/components/export/ExportarModal";
import type { ExportFormat } from "@/components/export/export-types";
import {
    PassagensFiltrosCampos,
    buildPassagemExportQuery,
    type PassagemFiltrosAplicados,
} from "./PassagensFiltros";

const DESCRICOES: Record<ExportFormat, string> = {
    csv: "Planilha em texto separada por ponto e vírgula, com nome e IP do equipamento de cada passagem.",
    xlsx: "Planilha do Excel (.xlsx), com nome e IP do equipamento de cada passagem.",
    pdf: "Relatório em PDF com foto da pessoa, nome e IP do equipamento, cabeçalho SchoolGuard e numeração de páginas. Limitado a 5.000 passagens.",
};

interface ExportarPassagensModalProps {
    formato: ExportFormat;
    onClose: () => void;
    codigoInstituicao: number | string;
    /** Filtros aplicados na lista, usados como ponto de partida. */
    filtrosIniciais: PassagemFiltrosAplicados;
    gruposDisponiveis: string[];
    cursosDisponiveis: string[];
    seriesDisponiveis: string[];
    turmasDisponiveis: string[];
}

export default function ExportarPassagensModal({
    formato,
    onClose,
    codigoInstituicao,
    filtrosIniciais,
    gruposDisponiveis,
    cursosDisponiveis,
    seriesDisponiveis,
    turmasDisponiveis,
}: ExportarPassagensModalProps) {
    const [draft, setDraft] = useState<PassagemFiltrosAplicados>(filtrosIniciais);

    return (
        <ExportarModal
            formato={formato}
            onClose={onClose}
            descricao={DESCRICOES[formato]}
            nomeArquivoPadrao="passagens"
            buildPath={() =>
                `/instituicao/${codigoInstituicao}/passagem/export?${buildPassagemExportQuery(formato, draft)}`
            }
            validar={() =>
                draft.dataInicio && draft.dataFim && draft.dataInicio > draft.dataFim
                    ? "A data início deve ser anterior à data fim."
                    : null
            }
        >
            <div>
                <Label htmlFor="export-pass-nome">Nome ou nome social</Label>
                <InputField
                    id="export-pass-nome"
                    name="nome"
                    placeholder="Contém no nome ou nome social..."
                    value={draft.nome}
                    onChange={(e) => setDraft((d) => ({ ...d, nome: e.target.value }))}
                />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <PassagensFiltrosCampos
                    idPrefix="export-pass"
                    draft={draft}
                    setDraft={setDraft}
                    gruposDisponiveis={gruposDisponiveis}
                    cursosDisponiveis={cursosDisponiveis}
                    seriesDisponiveis={seriesDisponiveis}
                    turmasDisponiveis={turmasDisponiveis}
                />
            </div>
        </ExportarModal>
    );
}
