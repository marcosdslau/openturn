"use client";

import { useCallback, useState } from "react";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import { MoreDotIcon } from "@/icons";
import { EXPORT_FORMATOS, EXPORT_FORMAT_LABELS, type ExportFormat } from "./export-types";

interface ExportarMenuProps {
    onSelect: (formato: ExportFormat) => void;
}

/** Botão "três pontos" com as opções de exportação (CSV, Excel, PDF). */
export default function ExportarMenu({ onSelect }: ExportarMenuProps) {
    const [aberto, setAberto] = useState(false);
    const fechar = useCallback(() => setAberto(false), []);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setAberto((v) => !v)}
                className="dropdown-toggle flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                aria-label="Mais opções"
                aria-haspopup="menu"
                aria-expanded={aberto}
            >
                <MoreDotIcon />
            </button>
            <Dropdown isOpen={aberto} onClose={fechar} className="w-52 p-2">
                {EXPORT_FORMATOS.map((f) => (
                    <DropdownItem
                        key={f}
                        onClick={() => onSelect(f)}
                        onItemClick={fechar}
                        className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                    >
                        Exportar para {EXPORT_FORMAT_LABELS[f]}
                    </DropdownItem>
                ))}
            </Dropdown>
        </div>
    );
}
