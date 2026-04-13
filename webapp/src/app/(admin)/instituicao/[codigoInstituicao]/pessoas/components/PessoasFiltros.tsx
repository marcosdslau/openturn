"use client";

import { useEffect, useMemo, useState } from "react";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { ChevronDownIcon } from "@/icons";

export type PessoaFiltrosAplicados = {
    nome: string;
    documento: string;
    email: string;
    grupo: string;
    cartaoTag: string;
    ativo: boolean | undefined;
};

const EMPTY: PessoaFiltrosAplicados = {
    nome: "",
    documento: "",
    email: "",
    grupo: "",
    cartaoTag: "",
    ativo: undefined,
};

function toDraft(f: PessoaFiltrosAplicados) {
    return {
        nome: f.nome,
        documento: f.documento,
        email: f.email,
        grupo: f.grupo,
        cartaoTag: f.cartaoTag,
        ativoSelect: f.ativo === undefined ? "" : f.ativo ? "true" : "false",
    };
}

type Draft = ReturnType<typeof toDraft>;

function temFiltrosAvancadosAplicados(f: PessoaFiltrosAplicados) {
    return (
        !!f.documento.trim() ||
        !!f.email.trim() ||
        !!f.grupo.trim() ||
        !!f.cartaoTag.trim() ||
        f.ativo !== undefined
    );
}

interface PessoasFiltrosProps {
    aplicados: PessoaFiltrosAplicados;
    /** Valores distintos de PESGrupo na instituição (API). */
    gruposDisponiveis: string[];
    onAplicar: (f: PessoaFiltrosAplicados) => void;
    onLimpar: () => void;
}

export function buildPessoaListQuery(
    page: number,
    limit: number,
    f: PessoaFiltrosAplicados
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
    if (nome) p.set("nome", nome);
    if (documento) p.set("documento", documento);
    if (email) p.set("email", email);
    if (grupo) p.set("grupo", grupo);
    if (cartaoTag) p.set("cartaoTag", cartaoTag);
    if (f.ativo !== undefined) p.set("ativo", String(f.ativo));
    return p.toString();
}

export { EMPTY as PESSOA_FILTROS_VAZIOS };

export default function PessoasFiltros({
    aplicados,
    gruposDisponiveis,
    onAplicar,
    onLimpar,
}: PessoasFiltrosProps) {
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

    const aplicar = () => {
        const ativo =
            draft.ativoSelect === "" ? undefined : draft.ativoSelect === "true";
        onAplicar({
            nome: draft.nome,
            documento: draft.documento,
            email: draft.email,
            grupo: draft.grupo,
            cartaoTag: draft.cartaoTag,
            ativo,
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

    const enterAplica = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            aplicar();
        }
    };

    const selectClass =
        "h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-10 text-sm shadow-theme-xs text-gray-800 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

    return (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <button
                type="button"
                onClick={() => setAvancadoAberto((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left transition hover:bg-gray-50/80 dark:hover:bg-white/[0.04]"
                aria-expanded={avancadoAberto}
                aria-controls="pessoas-filtros-avancado"
                id="pessoas-filtros-cabecalho"
            >
                <div>
                    <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
                        Filtros
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {avancadoAberto
                            ? "Ocultar critérios adicionais"
                            : "Clique para documento, e-mail, grupo, cartão e situação"}
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
                        <Label htmlFor="filtro-nome">Nome ou nome social</Label>
                        <InputField
                            id="filtro-nome"
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
                            id="pessoas-filtros-avancado"
                            role="region"
                            aria-labelledby="pessoas-filtros-cabecalho"
                            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            <div>
                                <Label htmlFor="filtro-documento">Documento</Label>
                                <InputField
                                    id="filtro-documento"
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
                                <Label htmlFor="filtro-email">E-mail</Label>
                                <InputField
                                    id="filtro-email"
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
                                <Label htmlFor="filtro-grupo">Grupo</Label>
                                <div className="relative">
                                    <select
                                        id="filtro-grupo"
                                        name="grupo"
                                        value={draft.grupo}
                                        onChange={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                grupo: e.target.value,
                                            }))
                                        }
                                        onKeyDown={enterAplica}
                                        className={selectClass}
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
                                <Label htmlFor="filtro-cartao">Cartão / tag</Label>
                                <InputField
                                    id="filtro-cartao"
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
                                <Label htmlFor="filtro-ativo">Situação</Label>
                                <div className="relative">
                                    <select
                                        id="filtro-ativo"
                                        name="ativo"
                                        value={draft.ativoSelect}
                                        onChange={(e) =>
                                            setDraft((d) => ({
                                                ...d,
                                                ativoSelect: e.target.value,
                                            }))
                                        }
                                        onKeyDown={enterAplica}
                                        className={selectClass}
                                    >
                                        <option value="">Todas</option>
                                        <option value="true">Ativas</option>
                                        <option value="false">Inativas</option>
                                    </select>
                                </div>
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
