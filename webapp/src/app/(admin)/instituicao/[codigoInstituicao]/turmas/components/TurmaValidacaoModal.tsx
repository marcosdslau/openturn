"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import Label from "@/components/form/Label";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPut } from "@/lib/api";
import ResultadoSync from "./ResultadoSync";
import type { ResultadoEquipamento } from "./turma-tipos";

export interface TurmaAlvo {
    TRMCodigo: number;
    rotulo: string;
    TRMQtdePessoas: number;
}

interface DepartamentoOpcao {
    DEPCodigo: number;
    DEPNome: string;
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

interface EquipamentoOpcao {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPAtivo: boolean;
    suportado: boolean;
    selecionado: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    instituicaoId: string;
    /** Uma turma = edição individual; várias = configuração em lote. */
    turmas: TurmaAlvo[];
    podeEditar: boolean;
    podeSincronizar: boolean;
    onSaved: () => void;
    onVerAplicado?: () => void;
    /** Leva à tela de equipamentos, onde os departamentos são configurados. */
    onIrParaEquipamentos?: () => void;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Configuração de acesso da turma: departamento + escopo.
 *
 * A turma não define horário. Áreas, horários e regras são configurados por equipamento e vêm do
 * departamento — aqui só se escolhe qual e onde vale.
 */
export default function TurmaValidacaoModal({
    isOpen,
    onClose,
    instituicaoId,
    turmas,
    podeEditar,
    onSaved,
    onVerAplicado,
    onIrParaEquipamentos,
}: Props) {
    const { showToast } = useToast();
    const emLote = turmas.length > 1;

    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [departamentos, setDepartamentos] = useState<DepartamentoOpcao[]>([]);
    const [equipamentos, setEquipamentos] = useState<EquipamentoOpcao[]>([]);
    const [ativa, setAtiva] = useState(true);
    const [depCodigo, setDepCodigo] = useState<number | "">("");
    const [todos, setTodos] = useState(true);
    const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
    const [resultados, setResultados] = useState<ResultadoEquipamento[] | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setResultados(null);
        try {
            const [deps, turma] = await Promise.all([
                apiGet<DepartamentoOpcao[]>(`/instituicao/${instituicaoId}/turma/departamentos`),
                emLote
                    ? Promise.resolve(null)
                    : apiGet<{
                          TRMValidacaoAtiva: boolean;
                          departamento: { DEPCodigo: number } | null;
                          escopo: { todos: boolean; EQPCodigos: number[] };
                          equipamentos: EquipamentoOpcao[];
                      }>(`/instituicao/${instituicaoId}/turma/${turmas[0].TRMCodigo}`),
            ]);
            setDepartamentos(deps);
            if (turma) {
                setAtiva(turma.TRMValidacaoAtiva);
                setDepCodigo(turma.departamento?.DEPCodigo ?? "");
                setTodos(turma.escopo.todos);
                setSelecionados(new Set(turma.escopo.EQPCodigos));
                setEquipamentos(turma.equipamentos);
            } else {
                // Em lote não há estado comum: começa do zero, aplicando a todas.
                const primeira = await apiGet<{ equipamentos: EquipamentoOpcao[] }>(
                    `/instituicao/${instituicaoId}/turma/${turmas[0].TRMCodigo}`,
                );
                setEquipamentos(primeira.equipamentos);
            }
        } catch (e) {
            showToast("error", "Erro ao carregar", msg(e));
        } finally {
            setCarregando(false);
        }
    }, [instituicaoId, turmas, emLote, showToast]);

    useEffect(() => {
        if (isOpen) carregar();
    }, [isOpen, carregar]);

    const escolhido = useMemo(
        () => departamentos.find((d) => d.DEPCodigo === depCodigo) ?? null,
        [departamentos, depCodigo],
    );

    /** Equipamentos do escopo onde o departamento escolhido não foi adotado. */
    const semAdocao = useMemo(() => {
        if (!escolhido) return [];
        const adotados = new Set(escolhido.equipamentos.map((e) => e.EQPCodigo));
        return equipamentos
            .filter((e) => e.EQPAtivo && e.suportado && (todos || selecionados.has(e.EQPCodigo)))
            .filter((e) => !adotados.has(e.EQPCodigo));
    }, [escolhido, equipamentos, todos, selecionados]);

    const salvar = async () => {
        setSalvando(true);
        try {
            const corpo = {
                ativa,
                ...(ativa ? { DEPCodigo: Number(depCodigo) } : {}),
                escopo: todos ? { todos: true } : { todos: false, EQPCodigos: [...selecionados] },
            };
            const r = emLote
                ? await apiPut<{ resultados: ResultadoEquipamento[] }>(
                      `/instituicao/${instituicaoId}/turma/validacao/lote`,
                      { ...corpo, TRMCodigos: turmas.map((t) => t.TRMCodigo) },
                  )
                : await apiPut<{ resultados: ResultadoEquipamento[] }>(
                      `/instituicao/${instituicaoId}/turma/${turmas[0].TRMCodigo}/validacao`,
                      corpo,
                  );
            setResultados(r.resultados);
            showToast("success", ativa ? "Controle de acesso ativado" : "Controle de acesso desativado");
            onSaved();
        } catch (e) {
            showToast("error", "Não foi possível salvar", msg(e));
        } finally {
            setSalvando(false);
        }
    };

    const podeSalvar = podeEditar && !salvando && (!ativa || depCodigo !== "") && (todos || selecionados.size > 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-2xl rounded-2xl">
            <div className="flex max-h-[90vh] flex-col">
                <div className="shrink-0 border-b border-gray-100 px-6 py-4 pr-16 dark:border-gray-800">
                    <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                        {emLote ? `Controle de acesso — ${turmas.length} turmas` : `Controle de acesso — ${turmas[0].rotulo}`}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {emLote
                            ? turmas.map((t) => t.rotulo).join("; ")
                            : `${turmas[0].TRMQtdePessoas} pessoa(s) nesta turma`}
                    </p>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    {carregando ? (
                        <p className="py-8 text-center text-gray-400">Carregando...</p>
                    ) : resultados ? (
                        <ResultadoSync resultados={resultados} />
                    ) : (
                        <>
                            <label className="flex cursor-pointer items-center gap-3">
                                <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
                                <span className="text-sm text-gray-700 dark:text-gray-200">
                                    Controlar o acesso desta turma por departamento
                                </span>
                            </label>

                            {ativa && (
                                <>
                                    <div>
                                        <Label htmlFor="dep">Departamento</Label>
                                        <select
                                            id="dep"
                                            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                            value={depCodigo}
                                            onChange={(e) => setDepCodigo(e.target.value ? Number(e.target.value) : "")}
                                        >
                                            <option value="">Selecione…</option>
                                            {departamentos.map((d) => (
                                                <option key={d.DEPCodigo} value={d.DEPCodigo}>
                                                    {d.DEPNome} — adotado em {d.equipamentos.length} equipamento(s)
                                                </option>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-xs text-gray-500">
                                            Horários, áreas e regras vêm do departamento, configurados por equipamento.
                                        </p>
                                    </div>

                                    {!departamentos.length && (
                                        <div className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                            Nenhum departamento existe ainda. Crie um na configuração de um equipamento.
                                            {onIrParaEquipamentos && (
                                                <Button size="sm" variant="outline" className="ml-2" onClick={onIrParaEquipamentos}>
                                                    Ir para equipamentos
                                                </Button>
                                            )}
                                        </div>
                                    )}

                                    {escolhido && (
                                        <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                                            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Onde {escolhido.DEPNome} está configurado
                                            </p>
                                            {escolhido.equipamentos.length ? (
                                                <ul className="space-y-1 text-sm">
                                                    {escolhido.equipamentos.map((e) => (
                                                        <li key={e.EQPCodigo} className="flex flex-wrap items-baseline gap-2">
                                                            <span className="text-gray-700 dark:text-gray-200">
                                                                {e.EQPDescricao ?? `Equipamento ${e.EQPCodigo}`}
                                                            </span>
                                                            <span className="text-xs text-gray-400">{e.regras} regra(s)</span>
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
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-sm text-error-600">
                                                    Não adotado em nenhum equipamento: ninguém desta turma seria afetado.
                                                </p>
                                            )}
                                            {escolhido.qtdeTurmas > 0 && (
                                                <p className="mt-2 text-xs text-gray-400">
                                                    Também usado por: {escolhido.turmas.join("; ")}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <Label>Onde vale</Label>
                                        <div className="space-y-2">
                                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                                                <input type="radio" checked={todos} onChange={() => setTodos(true)} />
                                                Todos os equipamentos, inclusive os cadastrados depois
                                            </label>
                                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                                                <input type="radio" checked={!todos} onChange={() => setTodos(false)} />
                                                Só os selecionados
                                            </label>
                                        </div>
                                        {!todos && (
                                            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-800">
                                                {equipamentos.map((e) => (
                                                    <label
                                                        key={e.EQPCodigo}
                                                        className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selecionados.has(e.EQPCodigo)}
                                                            disabled={!e.suportado || !e.EQPAtivo}
                                                            onChange={(ev) => {
                                                                const s = new Set(selecionados);
                                                                if (ev.target.checked) s.add(e.EQPCodigo);
                                                                else s.delete(e.EQPCodigo);
                                                                setSelecionados(s);
                                                            }}
                                                        />
                                                        <span className={!e.suportado || !e.EQPAtivo ? "text-gray-400" : ""}>
                                                            {e.EQPDescricao ?? `Equipamento ${e.EQPCodigo}`}
                                                            {!e.suportado && " (marca sem suporte)"}
                                                            {!e.EQPAtivo && " (inativo)"}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {semAdocao.length > 0 && (
                                        <div className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                            O departamento não está adotado em{" "}
                                            {semAdocao.map((e) => e.EQPDescricao ?? e.EQPCodigo).join(", ")}. Nesses
                                            equipamentos as pessoas continuam no grupo padrão até alguém adotar lá.
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                <div className="flex shrink-0 justify-between gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
                    <div>
                        {onVerAplicado && !resultados && (
                            <Button size="sm" variant="outline" onClick={onVerAplicado}>
                                Ver o que está no equipamento
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <Button size="sm" variant="outline" onClick={onClose} disabled={salvando}>
                            {resultados ? "Fechar" : "Cancelar"}
                        </Button>
                        {!resultados && (
                            <Button size="sm" onClick={salvar} disabled={!podeSalvar}>
                                {salvando ? "Salvando..." : "Salvar"}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
