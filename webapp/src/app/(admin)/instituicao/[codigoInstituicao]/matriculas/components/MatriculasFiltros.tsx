"use client";

import { useEffect, useState, type ReactNode } from "react";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { ChevronDownIcon } from "@/icons";
import SearchableMultiSelect from "@/components/form/SearchableMultiSelect";

export type MatriculaFiltrosAplicados = {
    nome: string;
    numero: string;
    cursos: string[];
    series: string[];
    turmas: string[];
};

const EMPTY: MatriculaFiltrosAplicados = {
    nome: "",
    numero: "",
    cursos: [],
    series: [],
    turmas: [],
};

type Draft = {
    nome: string;
    numero: string;
    cursos: string[];
    series: string[];
    turmas: string[];
};

function toDraft(f: MatriculaFiltrosAplicados): Draft {
    return {
        nome: f.nome,
        numero: f.numero,
        cursos: [...f.cursos],
        series: [...f.series],
        turmas: [...f.turmas],
    };
}

function temFiltrosAvancadosAplicados(f: MatriculaFiltrosAplicados) {
    return (
        !!f.numero.trim() ||
        f.cursos.length > 0 ||
        f.series.length > 0 ||
        f.turmas.length > 0
    );
}

interface MatriculasFiltrosProps {
    aplicados: MatriculaFiltrosAplicados;
    cursosDisponiveis: string[];
    seriesDisponiveis: string[];
    turmasDisponiveis: string[];
    onAplicar: (f: MatriculaFiltrosAplicados) => void;
    onLimpar: () => void;
    /** Ações alinhadas à direita na mesma linha dos filtros (ex.: Exportar). */
    extraActions?: ReactNode;
}

export function buildMatriculaListQuery(
    page: number,
    limit: number,
    f: MatriculaFiltrosAplicados
): string {
    const p = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });
    const nome = f.nome.trim();
    const numero = f.numero.trim();
    if (nome) p.set("nome", nome);
    if (numero) p.set("numero", numero);
    for (const c of f.cursos) p.append("curso", c);
    for (const s of f.series) p.append("serie", s);
    for (const t of f.turmas) p.append("turma", t);
    return p.toString();
}

/** Opções de layout apenas para exportação em PDF (query string). */
export type MatriculaExportPdfOptions = {
    pdfOrientation: "portrait" | "landscape";
    pdfColumns: 1 | 2;
    pdfRowsPerPage: number;
};

/** Query string para GET /matricula/export (filtros já aplicados, sem paginação). */
export function buildMatriculaExportQuery(
    format: "csv" | "xlsx" | "pdf",
    f: MatriculaFiltrosAplicados,
    pdfOptions?: MatriculaExportPdfOptions
): string {
    const p = new URLSearchParams({ format });
    const nome = f.nome.trim();
    const numero = f.numero.trim();
    if (nome) p.set("nome", nome);
    if (numero) p.set("numero", numero);
    for (const c of f.cursos) p.append("curso", c);
    for (const s of f.series) p.append("serie", s);
    for (const t of f.turmas) p.append("turma", t);
    if (format === "pdf" && pdfOptions) {
        p.set("pdfOrientation", pdfOptions.pdfOrientation);
        p.set("pdfColumns", String(pdfOptions.pdfColumns));
        p.set("pdfRowsPerPage", String(pdfOptions.pdfRowsPerPage));
    }
    return p.toString();
}

export { EMPTY as MATRICULA_FILTROS_VAZIOS };

export default function MatriculasFiltros({
    aplicados,
    cursosDisponiveis,
    seriesDisponiveis,
    turmasDisponiveis,
    onAplicar,
    onLimpar,
    extraActions,
}: MatriculasFiltrosProps) {
    const [draft, setDraft] = useState<Draft>(() => toDraft(aplicados));
    const [avancadoAberto, setAvancadoAberto] = useState(false);

    useEffect(() => {
        setDraft(toDraft(aplicados));
    }, [aplicados]);

    useEffect(() => {
        if (temFiltrosAvancadosAplicados(aplicados)) {
            setAvancadoAberto(true);
        }
    }, [aplicados]);

    const cursoOptions = cursosDisponiveis.map((c) => ({ value: c, label: c }));
    const serieOptions = seriesDisponiveis.map((s) => ({ value: s, label: s }));
    const turmaOptions = turmasDisponiveis.map((t) => ({ value: t, label: t }));

    const aplicar = () => {
        onAplicar({
            nome: draft.nome,
            numero: draft.numero,
            cursos: draft.cursos,
            series: draft.series,
            turmas: draft.turmas,
        });
    };

    const limpar = () => {
        setDraft(toDraft(EMPTY));
        onLimpar();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        aplicar();
    };

    return (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <button
                type="button"
                onClick={() => setAvancadoAberto((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left transition hover:bg-gray-50/80 dark:hover:bg-white/[0.04]"
                aria-expanded={avancadoAberto}
                aria-controls="matriculas-filtros-avancado"
                id="matriculas-filtros-cabecalho"
            >
                <div>
                    <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
                        Filtros
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {avancadoAberto
                            ? "Ocultar critérios adicionais"
                            : "Clique para número da matrícula, curso, módulo/série e turma"}
                    </p>
                </div>
                <span
                    className={`flex-shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${avancadoAberto ? "rotate-180" : ""}`}
                >
                    <ChevronDownIcon className="h-5 w-5" />
                </span>
            </button>

            <div className="space-y-6 border-t border-gray-100 p-4 dark:border-gray-800 sm:p-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="filtro-mat-nome">Nome ou nome social</Label>
                        <InputField
                            id="filtro-mat-nome"
                            name="nome"
                            placeholder="Contém no nome ou nome social..."
                            value={draft.nome}
                            onChange={(e) =>
                                setDraft((d) => ({ ...d, nome: e.target.value }))
                            }
                        />
                    </div>

                    {avancadoAberto && (
                        <div
                            id="matriculas-filtros-avancado"
                            role="region"
                            aria-labelledby="matriculas-filtros-cabecalho"
                            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                        >
                            <div>
                                <Label htmlFor="filtro-mat-numero">Número da matrícula</Label>
                                <InputField
                                    id="filtro-mat-numero"
                                    name="numero"
                                    placeholder="Contém no número..."
                                    value={draft.numero}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            numero: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <SearchableMultiSelect
                                className="col-span-1 sm:col-span-2"
                                label="Curso"
                                placeholder="Selecione um ou mais cursos"
                                options={cursoOptions}
                                value={draft.cursos}
                                onChange={(cursos) => setDraft((d) => ({ ...d, cursos }))}
                            />
                            <SearchableMultiSelect
                                className="col-span-1 sm:col-span-2"
                                label="Módulo / série"
                                placeholder="Selecione um ou mais módulos ou séries"
                                options={serieOptions}
                                value={draft.series}
                                onChange={(series) => setDraft((d) => ({ ...d, series }))}
                            />
                            <SearchableMultiSelect
                                className="col-span-1 sm:col-span-2"
                                label="Turma"
                                placeholder="Selecione uma ou mais turmas"
                                options={turmaOptions}
                                value={draft.turmas}
                                onChange={(turmas) => setDraft((d) => ({ ...d, turmas }))}
                            />
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex flex-wrap gap-3">
                            <Button type="submit" size="sm">
                                Aplicar filtros
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={limpar}>
                                Limpar
                            </Button>
                        </div>
                        {extraActions}
                    </div>
                </form>
            </div>
        </div>
    );
}
