"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import Checkbox from "@/components/form/input/Checkbox";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import FaixasHorarioEditor from "./FaixasHorarioEditor";
import ResultadoSync from "./ResultadoSync";
import {
    faixaPadrao,
    type Faixa,
    type PreviewPerfil,
    type ResultadoEquipamento,
    type TurmaDetalhe,
} from "./turma-tipos";

export interface TurmaAlvo {
    TRMCodigo: number;
    rotulo: string;
    TRMQtdePessoas: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    instituicaoId: string;
    /** Uma turma = edição individual; várias = configuração em lote (§13.3). */
    turmas: TurmaAlvo[];
    podeEditar: boolean;
    podeSincronizar: boolean;
    onSaved: () => void;
}

interface RespostaSalvar {
    perfil: { PHACodigo: number; PHANome: string; criado: boolean } | null;
    pessoasInvalidadas: number;
    resultados: ResultadoEquipamento[];
}

const SYNC_ROTULO = { em_dia: "em dia", pendente: "pendente", erro: "erro" } as const;
const SYNC_COR = { em_dia: "success", pendente: "warning", erro: "error" } as const;

export default function TurmaValidacaoModal({
    isOpen,
    onClose,
    instituicaoId,
    turmas,
    podeEditar,
    podeSincronizar,
    onSaved,
}: Props) {
    const { showToast } = useToast();
    const lote = turmas.length > 1;
    const primeira = turmas[0];

    const [carregando, setCarregando] = useState(false);
    const [detalhe, setDetalhe] = useState<TurmaDetalhe | null>(null);
    const [ativa, setAtiva] = useState(true);
    const [faixas, setFaixas] = useState<Faixa[]>([faixaPadrao()]);
    const [todos, setTodos] = useState(true);
    const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
    const [preview, setPreview] = useState<PreviewPerfil | null>(null);
    const [previewCarregando, setPreviewCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [resultado, setResultado] = useState<RespostaSalvar | null>(null);
    const [reenviando, setReenviando] = useState(false);
    const previewSeq = useRef(0);

    useEffect(() => {
        if (!isOpen || !primeira) return;
        setResultado(null);
        setPreview(null);
        setCarregando(true);
        apiGet<TurmaDetalhe>(`/instituicao/${instituicaoId}/turma/${primeira.TRMCodigo}`)
            .then((d) => {
                setDetalhe(d);
                if (lote) {
                    setAtiva(true);
                    setFaixas([faixaPadrao()]);
                    setTodos(true);
                    setSelecionados(new Set());
                } else {
                    setAtiva(d.TRMValidacaoAtiva || !d.perfil);
                    setFaixas(d.horarios.length ? d.horarios : [faixaPadrao()]);
                    setTodos(d.escopo.todos);
                    setSelecionados(new Set(d.escopo.EQPCodigos));
                }
            })
            .catch((e: Error) => showToast("error", "Erro ao carregar turma", e.message))
            .finally(() => setCarregando(false));
    }, [isOpen, instituicaoId, primeira, lote, showToast]);

    // Preview do perfil (§6.2) — a regra de horário é validada pela API, mesma do salvar.
    useEffect(() => {
        if (!isOpen || !ativa || carregando || resultado) return;
        const seq = ++previewSeq.current;
        setPreviewCarregando(true);
        const timer = setTimeout(() => {
            apiPost<PreviewPerfil>(`/instituicao/${instituicaoId}/turma/perfil/preview`, {
                horarios: faixas,
                ...(lote ? {} : { TRMCodigo: primeira?.TRMCodigo }),
            })
                .then((p) => seq === previewSeq.current && setPreview(p))
                .catch((e: Error) => seq === previewSeq.current && setPreview({ erros: [e.message], perfilExistente: null, nomeSugerido: null, perfilAtual: null, mesmoPerfilAtual: false }))
                .finally(() => seq === previewSeq.current && setPreviewCarregando(false));
        }, 400);
        return () => clearTimeout(timer);
    }, [isOpen, ativa, faixas, carregando, resultado, instituicaoId, lote, primeira]);

    const equipamentos = useMemo(() => (detalhe?.equipamentos ?? []).filter((e) => e.EQPAtivo), [detalhe]);
    const suportados = equipamentos.filter((e) => e.suportado);
    const totalPessoas = turmas.reduce((s, t) => s + (t.TRMQtdePessoas ?? 0), 0);
    const escopoAntes = useMemo(() => new Set(detalhe?.escopo.EQPCodigos ?? []), [detalhe]);
    const retirados =
        !lote && detalhe?.TRMValidacaoAtiva && !detalhe.escopo.todos && !todos
            ? [...escopoAntes].filter((c) => !selecionados.has(c)).length
            : 0;

    const escolherModo = (valorTodos: boolean) => {
        setTodos(valorTodos);
        if (!valorTodos && selecionados.size === 0) {
            setSelecionados(new Set(suportados.map((e) => e.EQPCodigo)));
        }
    };

    const alternarEquipamento = (codigo: number, marcado: boolean) => {
        setSelecionados((prev) => {
            const novo = new Set(prev);
            if (marcado) novo.add(codigo);
            else novo.delete(codigo);
            return novo;
        });
    };

    const errosHorario = ativa ? (preview?.erros ?? []) : [];
    const semEquipamento = ativa && !todos && selecionados.size === 0;
    const podeSalvar =
        podeEditar && !salvando && !carregando && (!ativa || (!!preview && !previewCarregando && !errosHorario.length && !semEquipamento));

    const salvar = async () => {
        setSalvando(true);
        const corpo = {
            ativa,
            horarios: ativa ? faixas : [],
            escopo: todos ? { todos: true } : { todos: false, EQPCodigos: [...selecionados] },
        };
        try {
            const r = lote
                ? await apiPut<RespostaSalvar>(`/instituicao/${instituicaoId}/turma/validacao/lote`, {
                      ...corpo,
                      TRMCodigos: turmas.map((t) => t.TRMCodigo),
                  })
                : await apiPut<RespostaSalvar>(`/instituicao/${instituicaoId}/turma/${primeira.TRMCodigo}/validacao`, corpo);
            setResultado(r);
            const falhas = r.resultados.filter((x) => x.status === "erro" || x.status === "ocupado").length;
            if (falhas) showToast("warning", "Salvo com pendências", `${falhas} equipamento(s) serão concluídos pela reconciliação.`);
            else showToast("success", "Controle de acesso salvo", r.perfil ? `Perfil ${r.perfil.PHANome}` : "Validação desativada");
            onSaved();
        } catch (e: unknown) {
            showToast("error", "Não foi possível salvar", e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    };

    const reenviar = async () => {
        if (!primeira) return;
        setReenviando(true);
        try {
            const r = await apiPost<{ resultados: ResultadoEquipamento[] }>(
                `/instituicao/${instituicaoId}/turma/${primeira.TRMCodigo}/sincronizar`,
                { forcar: true },
            );
            setResultado({ perfil: null, pessoasInvalidadas: 0, resultados: r.resultados });
            onSaved();
        } catch (e: unknown) {
            showToast("error", "Falha ao reenviar", e instanceof Error ? e.message : String(e));
        } finally {
            setReenviando(false);
        }
    };

    const titulo = lote ? `Configurar ${turmas.length} turmas` : (detalhe?.rotulo ?? primeira?.rotulo ?? "Turma");

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-2xl rounded-2xl p-6">
            <div className="max-h-[85vh] overflow-y-auto pr-1">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">{titulo}</h4>
                {lote ? (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {turmas.map((t) => t.rotulo).join(" · ")}
                    </p>
                ) : (
                    detalhe?.alteracao.em && (
                        <p className="mt-1 text-xs text-gray-400">
                            Alterado em {new Date(detalhe.alteracao.em).toLocaleString("pt-BR")}
                            {detalhe.alteracao.usuario ? ` por ${detalhe.alteracao.usuario}` : ""}
                            {detalhe.alteracao.rotina ? ` pela rotina #${detalhe.alteracao.rotina}` : ""}
                        </p>
                    )
                )}

                {carregando ? (
                    <p className="py-10 text-center text-sm text-gray-400">Carregando…</p>
                ) : resultado ? (
                    <div className="mt-5 space-y-4">
                        {resultado.perfil && (
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                {resultado.perfil.criado ? "Criado o perfil" : "Turma(s) agrupada(s) no perfil"}{" "}
                                <strong>{resultado.perfil.PHANome}</strong>.
                                {resultado.pessoasInvalidadas > 0 &&
                                    ` ${resultado.pessoasInvalidadas} cadastro(s) serão regravados nos equipamentos que mudaram de escopo nos próximos minutos.`}
                            </p>
                        )}
                        <ResultadoSync resultados={resultado.resultados} />
                        <div className="flex justify-end">
                            <Button size="sm" onClick={onClose}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-5 space-y-6">
                        <Checkbox
                            id="validacao-ativa"
                            label="Validar acesso por turma"
                            checked={ativa}
                            disabled={!podeEditar}
                            onChange={setAtiva}
                        />

                        {!ativa && !lote && detalhe?.TRMValidacaoAtiva && (
                            <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
                                Ao salvar, os alunos voltam ao grupo padrão em todos os equipamentos. O horário desta turma é
                                removido de cada equipamento quando ninguém mais estiver nele. O último horário e a seleção de
                                equipamentos ficam guardados para reativar depois.
                            </div>
                        )}

                        {ativa && (
                            <>
                                <section>
                                    <h5 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Faixas de horário</h5>
                                    <FaixasHorarioEditor faixas={faixas} onChange={setFaixas} disabled={!podeEditar} />

                                    <div className="mt-3 min-h-[3rem]" aria-live="polite">
                                        {errosHorario.length > 0 ? (
                                            <ul className="space-y-1 rounded-xl bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
                                                {errosHorario.map((e) => (
                                                    <li key={e}>{e}</li>
                                                ))}
                                            </ul>
                                        ) : preview && !previewCarregando ? (
                                            <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                                                {preview.perfilExistente ? (
                                                    preview.mesmoPerfilAtual ? (
                                                        <>
                                                            Horário do perfil <strong>{preview.perfilExistente.PHANome}</strong>, o mesmo atual.
                                                        </>
                                                    ) : (
                                                        <>
                                                            Horário igual ao perfil <strong>{preview.perfilExistente.PHANome}</strong>
                                                            {preview.perfilExistente.turmas.length
                                                                ? ` (${preview.perfilExistente.turmas.join("; ")})`
                                                                : ""}
                                                            . {lote ? "As turmas serão agrupadas nele." : "Esta turma será agrupada nele."}
                                                        </>
                                                    )
                                                ) : (
                                                    <>
                                                        Será criado o perfil <strong>{preview.nomeSugerido}</strong> — nome do departamento
                                                        nos equipamentos.
                                                    </>
                                                )}
                                                {preview.perfilAtual && !preview.mesmoPerfilAtual && preview.perfilAtual.outrasTurmas > 0 && (
                                                    <p className="mt-1 text-xs">
                                                        Esta turma sai de {preview.perfilAtual.PHANome}. As outras {preview.perfilAtual.outrasTurmas}{" "}
                                                        turma(s) continuam com o horário atual.
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400">Verificando horário…</p>
                                        )}
                                    </div>
                                </section>

                                <section>
                                    <h5 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Onde a regra vale</h5>
                                    <div className="space-y-2 text-sm">
                                        <label className="flex cursor-pointer items-start gap-2">
                                            <input
                                                type="radio"
                                                name="escopo"
                                                checked={todos}
                                                disabled={!podeEditar}
                                                onChange={() => escolherModo(true)}
                                                className="mt-1"
                                            />
                                            <span className="text-gray-700 dark:text-gray-300">
                                                Todos os equipamentos
                                                <span className="block text-xs text-gray-500">Inclusive os que forem cadastrados no futuro.</span>
                                            </span>
                                        </label>
                                        <label className="flex cursor-pointer items-start gap-2">
                                            <input
                                                type="radio"
                                                name="escopo"
                                                checked={!todos}
                                                disabled={!podeEditar}
                                                onChange={() => escolherModo(false)}
                                                className="mt-1"
                                            />
                                            <span className="text-gray-700 dark:text-gray-300">
                                                Selecionar equipamentos
                                                <span className="block text-xs text-gray-500">Equipamentos cadastrados depois não entram.</span>
                                            </span>
                                        </label>
                                    </div>

                                    {!todos && (
                                        <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                                            {equipamentos.map((e) => (
                                                <li key={e.EQPCodigo} className="flex items-center justify-between gap-3 px-3 py-2">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <Checkbox
                                                            id={`eqp-${e.EQPCodigo}`}
                                                            checked={selecionados.has(e.EQPCodigo)}
                                                            disabled={!podeEditar || !e.suportado}
                                                            onChange={(v) => alternarEquipamento(e.EQPCodigo, v)}
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm text-gray-800 dark:text-white/90">
                                                                {e.EQPDescricao ?? `Equipamento ${e.EQPCodigo}`}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {[e.EQPMarca, e.EQPModelo].filter(Boolean).join(" ")}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {!e.suportado ? (
                                                        <Badge size="sm" color="light">
                                                            Sem suporte
                                                        </Badge>
                                                    ) : e.sync ? (
                                                        <span title={e.sync.erro ?? undefined}>
                                                            <Badge size="sm" color={SYNC_COR[e.sync.status]}>
                                                                {SYNC_ROTULO[e.sync.status]}
                                                            </Badge>
                                                        </span>
                                                    ) : null}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {!todos && selecionados.size > 0 && selecionados.size < suportados.length && (
                                        <div className="mt-3 rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                            Nos equipamentos não selecionados, {totalPessoas > 0 ? `as ${totalPessoas} pessoas` : "as pessoas"}{" "}
                                            {lote ? "destas turmas" : "desta turma"} continuam passando <strong>sem restrição de horário</strong>.
                                        </div>
                                    )}
                                    {retirados > 0 && (
                                        <p className="mt-2 text-xs text-gray-500">
                                            {retirados} equipamento(s) sairão do escopo: as pessoas serão regravadas neles com o grupo padrão
                                            nos próximos minutos.
                                        </p>
                                    )}
                                    {semEquipamento && <p className="mt-2 text-sm text-error-600">Selecione ao menos um equipamento.</p>}
                                </section>
                            </>
                        )}

                        <p className="text-xs text-gray-400">
                            Os horários são avaliados pelo relógio de cada equipamento. Em modo emergência a catraca fica liberada
                            independentemente destas regras.
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            {!lote && podeSincronizar && detalhe?.TRMValidacaoAtiva ? (
                                <Button size="sm" variant="outline" onClick={reenviar} disabled={reenviando || salvando}>
                                    {reenviando ? "Reenviando…" : "Reenviar aos equipamentos"}
                                </Button>
                            ) : (
                                <span />
                            )}
                            <div className="flex gap-3">
                                <Button size="sm" variant="outline" onClick={onClose} disabled={salvando}>
                                    Cancelar
                                </Button>
                                {podeEditar && (
                                    <Button size="sm" onClick={salvar} disabled={!podeSalvar}>
                                        {salvando ? "Salvando e sincronizando…" : "Salvar e sincronizar"}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
