"use client";

import { useState } from "react";
import ExportarModal from "@/components/export/ExportarModal";
import type { ExportFormat } from "@/components/export/export-types";
import {
    RegistrosFiltrosCampos,
    buildRegistrosExportQuery,
    type RegistrosFiltrosAplicados,
} from "./RegistrosFiltros";

const INTERPRETACAO =
    "Os registros são a interpretação das passagens conforme a configuração de “Aglutinação de Registros Diários”, para lançamento de frequência no ERP Educacional.";

const DESCRICOES: Record<ExportFormat, string> = {
    csv: `Planilha em texto separada por ponto e vírgula. ${INTERPRETACAO}`,
    xlsx: `Planilha do Excel (.xlsx). ${INTERPRETACAO}`,
    pdf: `Documento em PDF (A4 retrato) com foto da pessoa, resumo da configuração de aglutinação, cabeçalho SchoolGuard e numeração de páginas. Limitado a 5.000 registros. ${INTERPRETACAO}`,
};

interface ExportarRegistrosModalProps {
    formato: ExportFormat;
    onClose: () => void;
    codigoInstituicao: number | string;
    /** Filtros aplicados na lista, usados como ponto de partida. */
    filtrosIniciais: RegistrosFiltrosAplicados;
    cursosDisponiveis: string[];
    seriesDisponiveis: string[];
    turmasDisponiveis: string[];
}

export default function ExportarRegistrosModal({
    formato,
    onClose,
    codigoInstituicao,
    filtrosIniciais,
    cursosDisponiveis,
    seriesDisponiveis,
    turmasDisponiveis,
}: ExportarRegistrosModalProps) {
    const [draft, setDraft] = useState<RegistrosFiltrosAplicados>(filtrosIniciais);

    return (
        <ExportarModal
            formato={formato}
            onClose={onClose}
            descricao={DESCRICOES[formato]}
            nomeArquivoPadrao="registros"
            buildPath={() =>
                `/instituicao/${codigoInstituicao}/registro-diario/export?${buildRegistrosExportQuery(formato, draft)}`
            }
            validar={() =>
                draft.dataInicio && draft.dataFim && draft.dataInicio > draft.dataFim
                    ? "A data início deve ser anterior à data fim."
                    : null
            }
        >
            <RegistrosFiltrosCampos
                draft={draft}
                setDraft={setDraft}
                cursosDisponiveis={cursosDisponiveis}
                seriesDisponiveis={seriesDisponiveis}
                turmasDisponiveis={turmasDisponiveis}
            />
        </ExportarModal>
    );
}
