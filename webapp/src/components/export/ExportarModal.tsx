"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { apiFetchBlob, triggerBlobDownload } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { EXPORT_FORMAT_LABELS, type ExportFormat } from "./export-types";

interface ExportarModalProps {
    formato: ExportFormat;
    onClose: () => void;
    /** Texto explicativo do arquivo gerado para o formato escolhido. */
    descricao: string;
    /** Caminho completo do GET de exportação, já com a query string. */
    buildPath: () => string;
    /** Nome usado se o servidor não informar `Content-Disposition`. */
    nomeArquivoPadrao: string;
    /** Retorna mensagem de erro para impedir a exportação, ou `null`. */
    validar?: () => string | null;
    /** Campos de filtro. */
    children: React.ReactNode;
}

/** Modal genérico de exportação: filtros (children) + botão Exportar que baixa o arquivo. */
export default function ExportarModal({
    formato,
    onClose,
    descricao,
    buildPath,
    nomeArquivoPadrao,
    validar,
    children,
}: ExportarModalProps) {
    const { showToast } = useToast();
    const [exporting, setExporting] = useState(false);

    const fechar = () => {
        if (!exporting) onClose();
    };

    const exportar = async (e: React.FormEvent) => {
        e.preventDefault();
        const erro = validar?.();
        if (erro) {
            showToast("error", "Filtros inválidos", erro);
            return;
        }
        setExporting(true);
        try {
            const { blob, suggestedFilename } = await apiFetchBlob(buildPath(), {
                timeoutMs: 180_000,
            });
            triggerBlobDownload(blob, suggestedFilename ?? `${nomeArquivoPadrao}.${formato}`);
            showToast("success", "Exportação", "Download iniciado.");
            onClose();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Não foi possível exportar.";
            showToast("error", "Erro ao exportar", msg);
        } finally {
            setExporting(false);
        }
    };

    return (
        <Modal isOpen onClose={fechar} className="max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <form onSubmit={exportar} className="space-y-5">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                        Exportar para {EXPORT_FORMAT_LABELS[formato]}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {descricao} Ajuste os filtros abaixo para definir o que será extraído.
                    </p>
                </div>

                <fieldset disabled={exporting} className="space-y-4 border-0 p-0 m-0">
                    {children}
                </fieldset>

                <div className="flex justify-end gap-3 pt-2">
                    <Button type="button" size="sm" variant="outline" onClick={fechar} disabled={exporting}>
                        Cancelar
                    </Button>
                    <Button type="submit" size="sm" disabled={exporting}>
                        {exporting ? "Gerando arquivo..." : "Exportar"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
