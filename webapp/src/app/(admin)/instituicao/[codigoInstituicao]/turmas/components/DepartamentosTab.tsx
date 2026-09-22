"use client";

import { useCallback, useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { useToast } from "@/context/ToastContext";
import { apiGet } from "@/lib/api";

interface DepartamentoItem {
    DEPCodigo: number;
    DEPNome: string;
    DEPDescricao: string | null;
    equipamentos: Array<{
        EQPCodigo: number;
        EQPDescricao: string | null;
        EQPAtivo: boolean;
        nome: string;
        revisado: boolean;
        regras: number;
        erro: string | null;
    }>;
    turmas: string[];
    qtdeTurmas: number;
}

interface Props {
    instituicaoId: string;
    versao: number;
}

/**
 * Aba "Departamentos": leitura. Quem cria, edita regras e adota departamento é a tela do
 * equipamento — aqui só se vê onde cada um está e quais turmas o usam.
 */
export default function DepartamentosTab({ instituicaoId, versao }: Props) {
    const { showToast } = useToast();
    const [itens, setItens] = useState<DepartamentoItem[]>([]);
    const [carregando, setCarregando] = useState(true);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setItens(await apiGet<DepartamentoItem[]>(`/instituicao/${instituicaoId}/turma/departamentos`));
        } catch (e) {
            showToast("error", "Erro ao carregar departamentos", e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, [instituicaoId, showToast]);

    useEffect(() => {
        carregar();
    }, [carregar, versao]);

    if (carregando) return <p className="py-10 text-center text-gray-400">Carregando...</p>;

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Departamentos são configurados em <strong>Equipamentos → Configuração</strong>, um por catraca. A turma
                apenas aponta para um deles.
            </p>

            {itens.map((d) => (
                <div
                    key={d.DEPCodigo}
                    className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="font-medium text-gray-800 dark:text-white/90">{d.DEPNome}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {d.qtdeTurmas ? d.turmas.join("; ") : "sem turma usando"}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {!d.equipamentos.length && (
                                <Badge size="sm" color="error">
                                    não adotado em nenhum equipamento
                                </Badge>
                            )}
                            {d.equipamentos.some((e) => !e.revisado) && (
                                <Badge size="sm" color="warning">
                                    {d.equipamentos.filter((e) => !e.revisado).length} não revisado(s)
                                </Badge>
                            )}
                            {d.equipamentos.some((e) => !e.regras) && (
                                <Badge size="sm" color="error">
                                    {d.equipamentos.filter((e) => !e.regras).length} sem regra
                                </Badge>
                            )}
                        </div>
                    </div>

                    {d.equipamentos.length > 0 && (
                        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
                            {d.equipamentos.map((e) => (
                                <li key={e.EQPCodigo} className="flex flex-wrap items-baseline gap-2">
                                    <span className="text-gray-700 dark:text-gray-200">
                                        {e.EQPDescricao ?? `Equipamento ${e.EQPCodigo}`}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        como &quot;{e.nome}&quot; · {e.regras} regra(s)
                                    </span>
                                    {!e.EQPAtivo && (
                                        <Badge size="sm" color="light">
                                            inativo
                                        </Badge>
                                    )}
                                    {!e.regras && (
                                        <Badge size="sm" color="error">
                                            ninguém passa
                                        </Badge>
                                    )}
                                    {!e.revisado && (
                                        <Badge size="sm" color="warning">
                                            não revisado
                                        </Badge>
                                    )}
                                    {e.erro && (
                                        <Badge size="sm" color="error">
                                            {e.erro}
                                        </Badge>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}

            {!itens.length && (
                <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                    Nenhum departamento ainda. Crie ou adote um na configuração de um equipamento.
                </p>
            )}
        </div>
    );
}
