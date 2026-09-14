"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import { useToast } from "@/context/ToastContext";
import { apiGet } from "@/lib/api";
import DiagramaRegraTurma, { COR_SENTIDO } from "./DiagramaRegraTurma";
import {
    SENTIDOS,
    SENTIDO_INFO,
    type CanonicoRegras,
    type EquipamentoTurma,
    type LeituraRegraAplicada,
    type TurmaDetalhe,
} from "./turma-tipos";
import type { TurmaAlvo } from "./TurmaValidacaoModal";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    instituicaoId: string;
    turma: TurmaAlvo;
    podeEditar: boolean;
    onEditar?: () => void;
    onIrParaEquipamentos?: () => void;
}

type Leitura = {
    carregando: boolean;
    dados?: LeituraRegraAplicada;
    erro?: string;
};
type Visao = "aplicado" | "configurado";

function motivoIndisponivel(e: EquipamentoTurma): string | null {
    if (!e.EQPAtivo) return "inativo";
    if (!e.suportado) return "sem suporte";
    if (!e.sentido.preparado) return "áreas não preparadas";
    return null;
}

/**
 * Diagrama da turma: regra configurada × regra DE FATO gravada em cada equipamento
 * (departamento, regras por portal e horários lidos direto do hardware).
 */
export default function TurmaDiagramaModal({ isOpen, onClose, instituicaoId, turma, podeEditar, onEditar, onIrParaEquipamentos }: Props) {
    const { showToast } = useToast();
    const [detalhe, setDetalhe] = useState<TurmaDetalhe | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [eqpSelecionado, setEqpSelecionado] = useState<number | null>(null);
    const [leituras, setLeituras] = useState<Record<number, Leitura>>({});
    const [visao, setVisao] = useState<Visao>("aplicado");

    const ler = useCallback(
        async (eqp: number) => {
            setLeituras((prev) => ({
                ...prev,
                [eqp]: { carregando: true, dados: prev[eqp]?.dados },
            }));
            try {
                const dados = await apiGet<LeituraRegraAplicada>(`/instituicao/${instituicaoId}/turma/${turma.TRMCodigo}/aplicado/${eqp}`);
                setLeituras((prev) => ({
                    ...prev,
                    [eqp]: { carregando: false, dados },
                }));
            } catch (e: unknown) {
                setLeituras((prev) => ({
                    ...prev,
                    [eqp]: {
                        carregando: false,
                        erro: e instanceof Error ? e.message : String(e),
                    },
                }));
            }
        },
        [instituicaoId, turma.TRMCodigo],
    );

    useEffect(() => {
        if (!isOpen) return;
        setCarregando(true);
        setLeituras({});
        setVisao("aplicado");
        apiGet<TurmaDetalhe>(`/instituicao/${instituicaoId}/turma/${turma.TRMCodigo}`)
            .then((d) => {
                setDetalhe(d);
                const primeiro =
                    d.equipamentos.find((e) => e.noEscopo && !motivoIndisponivel(e)) ?? d.equipamentos.find((e) => !motivoIndisponivel(e));
                setEqpSelecionado(primeiro?.EQPCodigo ?? null);
            })
            .catch((e: Error) => showToast("error", "Erro ao carregar turma", e.message))
            .finally(() => setCarregando(false));
    }, [isOpen, instituicaoId, turma.TRMCodigo, showToast]);

    useEffect(() => {
        if (isOpen && detalhe?.perfil && eqpSelecionado != null && !leituras[eqpSelecionado]) ler(eqpSelecionado);
    }, [isOpen, detalhe, eqpSelecionado, leituras, ler]);

    const equipamentos = useMemo(
        () => [...(detalhe?.equipamentos ?? [])].sort((a, b) => Number(b.noEscopo) - Number(a.noEscopo)),
        [detalhe],
    );
    const leitura = eqpSelecionado != null ? leituras[eqpSelecionado] : undefined;
    const eqp = equipamentos.find((e) => e.EQPCodigo === eqpSelecionado);
    const aplicado: CanonicoRegras | null = leitura?.dados?.aplicado
        ? {
              interna: {
                  modo: leitura.dados.aplicado.interna.modo,
                  dias: leitura.dados.aplicado.interna.dias,
              },
              externa: {
                  modo: leitura.dados.aplicado.externa.modo,
                  dias: leitura.dados.aplicado.externa.dias,
              },
          }
        : null;

    const noDiagrama = {
        rotulo: detalhe?.rotulo ?? turma.rotulo,
        perfil: detalhe?.perfil?.PHANome,
        pessoas: detalhe?.TRMQtdePessoas ?? turma.TRMQtdePessoas,
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-5xl overflow-hidden rounded-2xl">
            {/* Cabeçalho fixo com o canto do botão fechar reservado; só o corpo rola. */}
            <div className="flex max-h-[90vh] flex-col">
                <div className="flex min-h-[5.5rem] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-100 py-4 pl-6 pr-16 sm:pr-24 dark:border-gray-800">
                    <div className="min-w-0">
                        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            Regra de acesso · {detalhe?.rotulo ?? turma.rotulo}
                        </h4>
                        {detalhe && (
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                {[detalhe.TRMTurno, detalhe.TRMAnoReferencia, `${detalhe.TRMQtdePessoas} pessoa(s)`]
                                    .filter(Boolean)
                                    .join(" · ")}
                                {detalhe.perfil && (
                                    <>
                                        {" · departamento "}
                                        <span className="font-mono text-gray-700 dark:text-gray-300">{detalhe.perfil.PHANome}</span>
                                        {detalhe.perfil.outrasTurmas.length > 0 && ` (também: ${detalhe.perfil.outrasTurmas.join("; ")})`}
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {detalhe && (
                            <Badge size="sm" color={detalhe.TRMValidacaoAtiva ? "success" : "light"}>
                                {detalhe.TRMValidacaoAtiva ? "Controle ativo" : "Controle inativo"}
                            </Badge>
                        )}
                        {onEditar && (
                            <Button size="sm" variant="outline" onClick={onEditar}>
                                {podeEditar ? "Editar regra" : "Ver configuração"}
                            </Button>
                        )}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {carregando || !detalhe ? (
                        <p className="py-10 text-center text-sm text-gray-400">Carregando…</p>
                    ) : !detalhe.perfil || !detalhe.canonico ? (
                        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
                            Esta turma ainda não tem regra de acesso configurada.
                        </p>
                    ) : (
                        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
                            <aside className="space-y-2">
                                <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Equipamento</p>
                                <ul className="space-y-1.5">
                                    {equipamentos.map((e) => {
                                        const motivo = motivoIndisponivel(e);
                                        const ativo = e.EQPCodigo === eqpSelecionado;
                                        const l = leituras[e.EQPCodigo];
                                        return (
                                            <li key={e.EQPCodigo}>
                                                <button
                                                    type="button"
                                                    disabled={!!motivo}
                                                    onClick={() => {
                                                        setEqpSelecionado(e.EQPCodigo);
                                                        setVisao("aplicado");
                                                    }}
                                                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                                                        ativo
                                                            ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                                                            : "border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]"
                                                    }`}
                                                >
                                                    <span className="block truncate text-sm font-medium text-gray-800 dark:text-white/90">
                                                        {e.EQPDescricao ?? `Equipamento ${e.EQPCodigo}`}
                                                    </span>
                                                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                                                        {motivo ? (
                                                            motivo
                                                        ) : (
                                                            <>
                                                                {e.noEscopo ? "no escopo" : "fora do escopo"}
                                                                {l?.dados &&
                                                                    (l.dados.diferencas.length ? (
                                                                        <Badge size="sm" color="error">
                                                                            divergente
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge size="sm" color="success">
                                                                            conforme
                                                                        </Badge>
                                                                    ))}
                                                                {l?.erro && (
                                                                    <Badge size="sm" color="warning">
                                                                        sem leitura
                                                                    </Badge>
                                                                )}
                                                            </>
                                                        )}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                                {equipamentos.some((e) => e.EQPAtivo && e.suportado && !e.sentido.preparado) && onIrParaEquipamentos && (
                                    <button
                                        type="button"
                                        onClick={onIrParaEquipamentos}
                                        className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                                    >
                                        Preparar áreas nos equipamentos
                                    </button>
                                )}
                            </aside>

                            <section className="min-w-0 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-white/5" role="tablist">
                                        {(
                                            [
                                                ["aplicado", "No equipamento"],
                                                ["configurado", "Configurado"],
                                            ] as const
                                        ).map(([valor, rotulo]) => (
                                            <button
                                                key={valor}
                                                role="tab"
                                                aria-selected={visao === valor}
                                                onClick={() => setVisao(valor)}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                                                    visao === valor
                                                        ? "bg-white text-gray-800 shadow-theme-xs dark:bg-gray-800 dark:text-white"
                                                        : "text-gray-500"
                                                }`}
                                            >
                                                {rotulo}
                                            </button>
                                        ))}
                                    </div>
                                    {visao === "aplicado" && eqp && (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            {leitura?.dados && (
                                                <span>lido às {new Date(leitura.dados.lidoEm).toLocaleTimeString("pt-BR")}</span>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => ler(eqp.EQPCodigo)}
                                                disabled={leitura?.carregando}
                                            >
                                                {leitura?.carregando ? "Lendo…" : "Ler novamente"}
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {visao === "configurado" ? (
                                    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                                        <DiagramaRegraTurma canonico={detalhe.canonico} turma={noDiagrama} />
                                        <p className="mt-3 text-xs text-gray-400">
                                            Configuração salva no SchoolGuard
                                            {detalhe.escopo.todos
                                                ? " — vale em todos os equipamentos com áreas preparadas."
                                                : ` — vale em ${detalhe.escopo.EQPCodigos.length} equipamento(s).`}
                                        </p>
                                    </div>
                                ) : !eqp ? (
                                    <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
                                        Nenhum equipamento com áreas preparadas para ler.
                                    </p>
                                ) : leitura?.erro ? (
                                    <p className="rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
                                        {leitura.erro}
                                    </p>
                                ) : !leitura?.dados ? (
                                    <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400 dark:border-gray-800">
                                        Lendo departamento, regras, portais e horários de {eqp.EQPDescricao ?? "equipamento"}…
                                    </div>
                                ) : (
                                    <>
                                        <div
                                            className={`rounded-xl p-3 text-sm ${
                                                leitura.dados.diferencas.length
                                                    ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
                                                    : "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
                                            }`}
                                        >
                                            {leitura.dados.diferencas.length ? (
                                                <ul className="list-inside list-disc space-y-0.5">
                                                    {leitura.dados.diferencas.map((d) => (
                                                        <li key={d}>{d}</li>
                                                    ))}
                                                </ul>
                                            ) : leitura.dados.esperado ? (
                                                "Em conformidade: o equipamento aplica exatamente a regra configurada para a turma."
                                            ) : (
                                                "A turma não tem regra neste equipamento, como esperado."
                                            )}
                                            {leitura.dados.diferencas.length > 0 && podeEditar && (
                                                <p className="mt-1 text-xs">
                                                    Use “Reenviar aos equipamentos” na configuração da turma ou “Reconciliar equipamentos”
                                                    para corrigir.
                                                </p>
                                            )}
                                        </div>

                                        {aplicado ? (
                                            <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                                                <DiagramaRegraTurma
                                                    canonico={aplicado}
                                                    referencia={leitura.dados.esperado}
                                                    turma={{
                                                        ...noDiagrama,
                                                        pessoas: leitura.dados.membros,
                                                        extra: eqp.EQPDescricao,
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
                                                O departamento {leitura.dados.perfil.PHANome} não existe em{" "}
                                                {eqp.EQPDescricao ?? "este equipamento"}.
                                            </p>
                                        )}

                                        <dl className="grid gap-3 text-xs sm:grid-cols-2">
                                            {SENTIDOS.map((s) => {
                                                const regra = leitura.dados!.aplicado?.[s];
                                                return (
                                                    <div
                                                        key={s}
                                                        className={`rounded-xl border-l-4 bg-gray-50 p-3 dark:bg-white/[0.03] ${COR_SENTIDO[s].borda}`}
                                                    >
                                                        <dt className={`font-semibold ${COR_SENTIDO[s].texto}`}>
                                                            {SENTIDO_INFO[s].titulo}
                                                        </dt>
                                                        <dd className="mt-1 space-y-0.5 text-gray-600 dark:text-gray-400">
                                                            <p>
                                                                Portal <span className="font-mono">#{leitura.dados!.portais[s]}</span>
                                                                {leitura.dados!.invertido && " (sentidos invertidos após teste em bancada)"}
                                                            </p>
                                                            {regra?.regras.length ? (
                                                                regra.regras.map((r) => (
                                                                    <p key={r.id}>
                                                                        Regra <span className="font-mono">#{r.id}</span> {r.nome}
                                                                        {r.semHorario &&
                                                                            " — sem horário vinculado (tratada como sempre liberado)"}
                                                                    </p>
                                                                ))
                                                            ) : (
                                                                <p>Nenhuma regra de permissão do departamento neste portal.</p>
                                                            )}
                                                        </dd>
                                                    </div>
                                                );
                                            })}
                                        </dl>
                                        <p className="text-xs text-gray-400">
                                            {leitura.dados.membros} pessoa(s) no departamento dentro do equipamento. Pessoas desta turma
                                            recebem o departamento pela rotina de envio de pessoas.
                                            {!eqp.sentido.validado &&
                                                " Os sentidos deste equipamento ainda não foram conferidos em bancada."}
                                        </p>
                                    </>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
