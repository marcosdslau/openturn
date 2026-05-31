"use client";

import { useEffect, useMemo, useState } from "react";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { ChevronDownIcon } from "@/icons";
import SearchableMultiSelect from "@/components/form/SearchableMultiSelect";

export type PassagemFiltrosAplicados = {
    nome: string;
    documento: string;
    email: string;
    grupo: string;
    cartaoTag: string;
    numeroMatricula: string;
    cursos: string[];
    series: string[];
    turmas: string[];
    acao: "" | "ENTRADA" | "SAIDA";
    dataInicio: string;
    dataFim: string;
};

const EMPTY: PassagemFiltrosAplicados = {
    nome: "",
    documento: "",
    email: "",
    grupo: "",
    cartaoTag: "",
    numeroMatricula: "",
    cursos: [],
    series: [],
    turmas: [],
    acao: "",
    dataInicio: "",
    dataFim: "",
};

type Draft = PassagemFiltrosAplicados;

function toDraft(f: PassagemFiltrosAplicados): Draft {
    return {
        nome: f.nome,
        documento: f.documento,
        email: f.email,
        grupo: f.grupo,
        cartaoTag: f.cartaoTag,
        numeroMatricula: f.numeroMatricula,
        cursos: [...f.cursos],
        series: [...f.series],
        turmas: [...f.turmas],
        acao: f.acao,
        dataInicio: f.dataInicio,
        dataFim: f.dataFim,
    };
}

function temFiltrosAvancadosAplicados(f: PassagemFiltrosAplicados) {
    return (
        !!f.documento.trim() ||
        !!f.email.trim() ||
        !!f.grupo.trim() ||
        !!f.cartaoTag.trim() ||
        !!f.numeroMatricula.trim() ||
        f.cursos.length > 0 ||
        f.series.length > 0 ||
        f.turmas.length > 0 ||
        !!f.acao ||
        !!f.dataInicio ||
        !!f.dataFim
    );
}

interface PassagensFiltrosProps {
    aplicados: PassagemFiltrosAplicados;
    gruposDisponiveis: string[];
    cursosDisponiveis: string[];
    seriesDisponiveis: string[];
    turmasDisponiveis: string[];
    onAplicar: (f: PassagemFiltrosAplicados) => void;
    onLimpar: () => void;
}

export function buildPassagemListQuery(
    page: number,
    limit: number,
    f: PassagemFiltrosAplicados
): string {
    const p = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });

    const nome = f.nome.trim();
    const documento = f.documento.trim();
    const email = f.email.trim();
    const grupo = f.grupo.trim();
    const cartaoTag = f.cartaoTag.trim();
    const numero = f.numeroMatricula.trim();
    if (nome) p.set("nome", nome);
    if (documento) p.set("documento", documento);
    if (email) p.set("email", email);
    if (grupo) p.set("grupo", grupo);
    if (cartaoTag) p.set("cartaoTag", cartaoTag);
    if (numero) p.set("numero", numero);
    for (const c of f.cursos) p.append("curso", c);
    for (const s of f.series) p.append("serie", s);
    for (const t of f.turmas) p.append("turma", t);

    if (f.acao) p.set("REGAcao", f.acao);
    if (f.dataInicio) p.set("dataInicio", f.dataInicio);
    if (f.dataFim) p.set("dataFim", f.dataFim);

    return p.toString();
}

export { EMPTY as PASSAGEM_FILTROS_VAZIOS };

export default function PassagensFiltros({
    aplicados,
    gruposDisponiveis,
    cursosDisponiveis,
    seriesDisponiveis,
    turmasDisponiveis,
    onAplicar,
    onLimpar,
}: PassagensFiltrosProps) {
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

    const opcoesGrupo = useMemo(() => {
        const set = new Set(gruposDisponiveis);
        const atual = draft.grupo.trim();
        if (atual) set.add(atual);
        return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }, [gruposDisponiveis, draft.grupo]);

    const cursoOptions = cursosDisponiveis.map((c) => ({ value: c, label: c }));
    const serieOptions = seriesDisponiveis.map((s) => ({ value: s, label: s }));
    const turmaOptions = turmasDisponiveis.map((t) => ({ value: t, label: t }));

    const aplicar = () => {
        onAplicar({
            nome: draft.nome,
            documento: draft.documento,
            email: draft.email,
            grupo: draft.grupo,
            cartaoTag: draft.cartaoTag,
            numeroMatricula: draft.numeroMatricula,
            cursos: draft.cursos,
            series: draft.series,
            turmas: draft.turmas,
            acao: draft.acao,
            dataInicio: draft.dataInicio,
            dataFim: draft.dataFim,
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
                aria-controls="passagens-filtros-avancado"
                id="passagens-filtros-cabecalho"
            >
                <div>
                    <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
                        Filtros
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {avancadoAberto
                            ? "Ocultar critérios adicionais"
                            : "Clique para filtros por pessoa, matrícula, ação e período"}
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
                        <Label htmlFor="filtro-pass-nome">Nome ou nome social</Label>
                        <InputField
                            id="filtro-pass-nome"
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
                            id="passagens-filtros-avancado"
                            role="region"
                            aria-labelledby="passagens-filtros-cabecalho"
                            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            <div>
                                <Label htmlFor="filtro-pass-documento">Documento</Label>
                                <InputField
                                    id="filtro-pass-documento"
                                    name="documento"
                                    placeholder="CPF, RG..."
                                    value={draft.documento}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            documento: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <Label htmlFor="filtro-pass-email">E-mail</Label>
                                <InputField
                                    id="filtro-pass-email"
                                    name="email"
                                    type="email"
                                    placeholder="Contém no e-mail..."
                                    value={draft.email}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            email: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <Label htmlFor="filtro-pass-grupo">Grupo</Label>
                                <div className="relative">
                                    <select
                                        id="filtro-pass-grupo"
                                        name="grupo"
                                        value={draft.grupo}
                                        onChange={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                grupo: e.target.value,
                                            }))
                                        }
                                        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-10 text-sm shadow-theme-xs text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
                                    >
                                        <option value="">Todos os grupos</option>
                                        {opcoesGrupo.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="filtro-pass-cartao">Cartão / tag</Label>
                                <InputField
                                    id="filtro-pass-cartao"
                                    name="cartaoTag"
                                    placeholder="Identificador do cartão ou tag..."
                                    value={draft.cartaoTag}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            cartaoTag: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <Label htmlFor="filtro-pass-numero">Número da matrícula</Label>
                                <InputField
                                    id="filtro-pass-numero"
                                    name="numeroMatricula"
                                    placeholder="Contém no número..."
                                    value={draft.numeroMatricula}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            numeroMatricula: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <SearchableMultiSelect
                                className="col-span-1 sm:col-span-2 lg:col-span-3"
                                label="Curso"
                                placeholder="Selecione um ou mais cursos"
                                options={cursoOptions}
                                value={draft.cursos}
                                onChange={(cursos) =>
                                    setDraft((d) => ({ ...d, cursos }))
                                }
                            />
                            <SearchableMultiSelect
                                className="col-span-1 sm:col-span-2 lg:col-span-3"
                                label="Módulo / série"
                                placeholder="Selecione um ou mais módulos ou séries"
                                options={serieOptions}
                                value={draft.series}
                                onChange={(series) =>
                                    setDraft((d) => ({ ...d, series }))
                                }
                            />
                            <SearchableMultiSelect
                                className="col-span-1 sm:col-span-2 lg:col-span-3"
                                label="Turma"
                                placeholder="Selecione uma ou mais turmas"
                                options={turmaOptions}
                                value={draft.turmas}
                                onChange={(turmas) =>
                                    setDraft((d) => ({ ...d, turmas }))
                                }
                            />
                            <div>
                                <Label htmlFor="filtro-pass-acao">Ação</Label>
                                <div className="relative">
                                    <select
                                        id="filtro-pass-acao"
                                        name="acao"
                                        value={draft.acao}
                                        onChange={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                acao: e.target.value as Draft["acao"],
                                            }))
                                        }
                                        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-10 text-sm shadow-theme-xs text-gray-800 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
                                    >
                                        <option value="">Todas as ações</option>
                                        <option value="ENTRADA">Entrada</option>
                                        <option value="SAIDA">Saída</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="filtro-pass-inicio">Data início</Label>
                                <InputField
                                    id="filtro-pass-inicio"
                                    name="dataInicio"
                                    type="date"
                                    value={draft.dataInicio}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            dataInicio: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                            <div>
                                <Label htmlFor="filtro-pass-fim">Data fim</Label>
                                <InputField
                                    id="filtro-pass-fim"
                                    name="dataFim"
                                    type="date"
                                    value={draft.dataFim}
                                    onChange={(e) =>
                                        setDraft((d) => ({
                                            ...d,
                                            dataFim: e.target.value,
                                        }))
                                    }
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-3 pt-1">
                        <Button type="submit" size="sm">
                            Aplicar filtros
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={limpar}>
                            Limpar
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

