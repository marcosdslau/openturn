"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { COR_SENTIDO } from "./DiagramaRegraTurma";
import ResultadoSync from "./ResultadoSync";
import {
    SENTIDOS,
    SENTIDO_INFO,
    type CatraHost,
    type EquipamentoSentidoItem,
    type LeituraSentido,
    type ResultadoEquipamento,
    type SentidoVisao,
} from "./turma-tipos";

interface Props {
    instituicaoId: string;
    podeEditar: boolean;
    versao: number;
    onAlterado: () => void;
}

type Resultado = { titulo: string; alertas: string[]; resultados: ResultadoEquipamento[]; pessoasInvalidadas?: number };

const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

function CatraResumo({ catra }: { catra: CatraHost[] | null }) {
    if (!catra?.length) return <span className="text-gray-400">não lida</span>;
    return (
        <ul className="space-y-0.5">
            {catra.map((h) => (
                <li key={h.host} className="font-mono">
                    {h.host}:{" "}
                    {h.erro ? (
                        <span className="text-error-600">{h.erro}</span>
                    ) : (
                        <>
                            role={h.catra_role ?? "?"} · side_to_enter={h.catra_side_to_enter ?? "?"} ·{" "}
                            <span className={h.catra_default_fsm && h.catra_default_fsm !== "0" ? "text-warning-600" : ""}>
                                default_fsm={h.catra_default_fsm ?? "?"}
                            </span>
                        </>
                    )}
                </li>
            ))}
        </ul>
    );
}

function MapaPortais({ sentido }: { sentido: SentidoVisao }) {
    if (!sentido.portais) return null;
    return (
        <div className="flex flex-wrap gap-2">
            {SENTIDOS.map((s) => (
                <span key={s} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${COR_SENTIDO[s].chip}`}>
                    <span className="font-mono">portal #{sentido.portais![s]}</span>
                    <span aria-hidden>→</span>
                    {SENTIDO_INFO[s].titulo}
                </span>
            ))}
        </div>
    );
}

/**
 * Aba "Equipamentos (áreas)": Área Interna, Área Externa e os dois portais por equipamento
 * (SpecControlId.md §3, §6.1–6.2), leitura da configuração da catraca e teste em bancada (§8).
 */
export default function EquipamentosSentidoTab({ instituicaoId, podeEditar, versao, onAlterado }: Props) {
    const { showToast } = useToast();
    const [itens, setItens] = useState<EquipamentoSentidoItem[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [ocupado, setOcupado] = useState<number | null>(null);
    const [resultado, setResultado] = useState<Resultado | null>(null);
    const [leitura, setLeitura] = useState<{ item: EquipamentoSentidoItem; dados: LeituraSentido } | null>(null);
    const [inverter, setInverter] = useState<EquipamentoSentidoItem | null>(null);
    const [ajudaAberta, setAjudaAberta] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setItens(await apiGet<EquipamentoSentidoItem[]>(`/instituicao/${instituicaoId}/turma/sentido`));
        } catch (e: unknown) {
            showToast("error", "Erro ao carregar equipamentos", e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, [instituicaoId, showToast]);

    useEffect(() => {
        carregar();
    }, [carregar, versao]);

    const executar = async (item: EquipamentoSentidoItem, acao: () => Promise<void>) => {
        setOcupado(item.EQPCodigo);
        try {
            await acao();
            await carregar();
            onAlterado();
        } catch (e: unknown) {
            showToast("error", item.EQPDescricao ?? `Equipamento ${item.EQPCodigo}`, e instanceof Error ? e.message : String(e));
        } finally {
            setOcupado(null);
        }
    };

    const preparar = (item: EquipamentoSentidoItem) =>
        executar(item, async () => {
            const r = await apiPost<{ sentido: SentidoVisao; alertas: string[]; pessoasInvalidadas: number; resultados: ResultadoEquipamento[] }>(
                `/instituicao/${instituicaoId}/turma/sentido/${item.EQPCodigo}/preparar`,
                {},
                { timeoutMs: 5 * 60_000 },
            );
            setResultado({
                titulo: `Áreas preparadas em ${item.EQPDescricao ?? item.EQPCodigo}`,
                alertas: r.alertas,
                resultados: r.resultados,
                pessoasInvalidadas: r.pessoasInvalidadas,
            });
        });

    const lerEquipamento = (item: EquipamentoSentidoItem) =>
        executar(item, async () => {
            const dados = await apiGet<LeituraSentido>(`/instituicao/${instituicaoId}/turma/sentido/${item.EQPCodigo}/leitura`);
            setLeitura({ item, dados });
        });

    const atualizar = (item: EquipamentoSentidoItem, corpo: { invertido?: boolean; validado?: boolean }, titulo: string) =>
        executar(item, async () => {
            const r = await apiPut<{ sentido: SentidoVisao; resultados: ResultadoEquipamento[] }>(
                `/instituicao/${instituicaoId}/turma/sentido/${item.EQPCodigo}`,
                corpo,
            );
            if (r.resultados.length) setResultado({ titulo, alertas: [], resultados: r.resultados });
            else showToast("success", titulo);
        });

    const nomeDe = (areaId: string | null, leituraDados: LeituraSentido) =>
        leituraDados.leitura.areas.find((a) => a.id === areaId)?.nome ?? (areaId ? `área #${areaId}` : "—");

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
                <p>
                    Para controlar <strong>entrada</strong> e <strong>saída</strong> separadamente, cada catraca precisa das áreas{" "}
                    <strong>Área Interna</strong> e <strong>Área Externa</strong> e de dois portais: <em>Entrada Área Interna</em> (Externa → Interna) e{" "}
                    <em>Entrada Área Externa</em> (Interna → Externa). “Preparar áreas” cria o que falta, reaproveita o que já existe e copia as
                    regras gerais do equipamento para os portais novos — quem não está em turma com controle continua passando como hoje.
                </p>
                <button type="button" onClick={() => setAjudaAberta((v) => !v)} className="mt-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                    {ajudaAberta ? "Ocultar teste em bancada" : "Como validar em bancada"}
                </button>
                {ajudaAberta && (
                    <ol className="mt-2 list-inside list-decimal space-y-1 text-gray-600 dark:text-gray-400">
                        <li>Prepare as áreas e confira que <span className="font-mono">catra_default_fsm</span> está em 0 em todos os hosts.</li>
                        <li>
                            Configure uma turma de teste só neste equipamento com <em>Entrada na Área Interna</em> sempre liberada e{" "}
                            <em>Entrada na Área Externa</em> bloqueada, e aguarde a pessoa de teste receber o departamento.
                        </li>
                        <li>Passe a pessoa entrando na escola: deve liberar. Passe saindo: deve negar.</li>
                        <li>Se aconteceu o contrário, use “Inverter sentidos” e repita. Com o resultado correto, marque como validado.</li>
                        <li>Pessoa fora da turma deve continuar passando nos dois sentidos, conforme as regras gerais.</li>
                        <li>Em par Primário/Secundário, repita após ~60 s (sincronismo entre os equipamentos).</li>
                    </ol>
                )}
            </div>

            {carregando ? (
                <p className="py-8 text-center text-sm text-gray-400">Carregando…</p>
            ) : itens.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhum equipamento cadastrado.</p>
            ) : (
                <ul className="grid gap-3 xl:grid-cols-2">
                    {itens.map((item) => {
                        const s = item.sentido;
                        const alertas = s.diagnostico?.alertas ?? [];
                        const trabalhando = ocupado === item.EQPCodigo;
                        return (
                            <li
                                key={item.EQPCodigo}
                                className={`space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] ${
                                    item.EQPAtivo ? "" : "opacity-60"
                                }`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                                            {item.EQPDescricao ?? `Equipamento ${item.EQPCodigo}`}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {[item.EQPMarca, item.EQPModelo].filter(Boolean).join(" ")}
                                            {item.turmasNoEscopo > 0 && ` · ${item.turmasNoEscopo} turma(s) com controle no escopo`}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {!item.EQPAtivo ? (
                                            <Badge size="sm" color="light">
                                                Inativo
                                            </Badge>
                                        ) : !item.suportado ? (
                                            <Badge size="sm" color="light">
                                                Sem suporte
                                            </Badge>
                                        ) : s.preparado ? (
                                            <>
                                                <Badge size="sm" color="success">
                                                    Áreas preparadas
                                                </Badge>
                                                {s.invertido && (
                                                    <Badge size="sm" color="info">
                                                        Invertido
                                                    </Badge>
                                                )}
                                                <Badge size="sm" color={s.validadoEm ? "success" : "warning"}>
                                                    {s.validadoEm ? "Validado em bancada" : "Validação pendente"}
                                                </Badge>
                                            </>
                                        ) : (
                                            <Badge size="sm" color="warning">
                                                Áreas não preparadas
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {item.suportado && item.EQPAtivo && (
                                    <>
                                        {s.preparado && <MapaPortais sentido={s} />}
                                        {!s.preparado && item.turmasNoEscopo > 0 && (
                                            <p className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                                Há turmas com controle que incluem este equipamento, mas as regras só são aplicadas depois de preparar
                                                as áreas. Até lá as pessoas passam sem restrição de turma.
                                            </p>
                                        )}
                                        <dl className="grid gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-[auto_minmax(0,1fr)] dark:text-gray-400">
                                            <dt className="text-gray-400">Catraca</dt>
                                            <dd>
                                                <CatraResumo catra={s.catra} />
                                            </dd>
                                            <dt className="text-gray-400">Preparado</dt>
                                            <dd>
                                                {dataHora(s.preparadoEm)}
                                                {s.diagnostico?.regrasReplicadas ? ` · ${s.diagnostico.regrasReplicadas} regra(s) geral(is) replicada(s)` : ""}
                                                {s.diagnostico?.criados?.length ? ` · criou: ${s.diagnostico.criados.join(", ")}` : ""}
                                            </dd>
                                            {s.validadoEm && (
                                                <>
                                                    <dt className="text-gray-400">Validado</dt>
                                                    <dd>{dataHora(s.validadoEm)}</dd>
                                                </>
                                            )}
                                        </dl>
                                        {alertas.length > 0 && (
                                            <ul className="space-y-1 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                                {alertas.map((a) => (
                                                    <li key={a}>{a}</li>
                                                ))}
                                            </ul>
                                        )}
                                        {s.ultimoErro && (
                                            <p className="rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-500/10 dark:text-error-400">
                                                Última falha: {s.ultimoErro}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap gap-2">
                                            {podeEditar && (
                                                <Button size="sm" onClick={() => preparar(item)} disabled={trabalhando}>
                                                    {trabalhando ? "Aguarde…" : s.preparado ? "Preparar novamente" : "Preparar áreas"}
                                                </Button>
                                            )}
                                            <Button size="sm" variant="outline" onClick={() => lerEquipamento(item)} disabled={trabalhando}>
                                                Ler equipamento
                                            </Button>
                                            {podeEditar && s.preparado && (
                                                <>
                                                    <Button size="sm" variant="outline" onClick={() => setInverter(item)} disabled={trabalhando}>
                                                        Inverter sentidos
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={trabalhando}
                                                        onClick={() =>
                                                            atualizar(
                                                                item,
                                                                { validado: !s.validadoEm },
                                                                s.validadoEm ? "Validação removida" : "Equipamento marcado como validado",
                                                            )
                                                        }
                                                    >
                                                        {s.validadoEm ? "Remover validação" : "Marcar como validado"}
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <Modal isOpen={!!resultado} onClose={() => setResultado(null)} className="w-full max-w-xl rounded-2xl p-6">
                {resultado && (
                    <div className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
                        <h4 className="pr-12 text-base font-semibold text-gray-800 dark:text-white/90">{resultado.titulo}</h4>
                        {resultado.alertas.length > 0 && (
                            <ul className="space-y-1 rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                {resultado.alertas.map((a) => (
                                    <li key={a}>{a}</li>
                                ))}
                            </ul>
                        )}
                        {!!resultado.pessoasInvalidadas && (
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {resultado.pessoasInvalidadas} pessoa(s) de turmas com controle serão regravadas neste equipamento pela rotina de
                                envio de pessoas.
                            </p>
                        )}
                        <ResultadoSync resultados={resultado.resultados} />
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => setResultado(null)}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={!!inverter} onClose={() => setInverter(null)} className="w-full max-w-md rounded-2xl p-6">
                {inverter && (
                    <div className="space-y-4">
                        <h4 className="pr-12 text-base font-semibold text-gray-800 dark:text-white/90">Inverter sentidos</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Use quando o teste em bancada mostrou entrada e saída trocadas em{" "}
                            <strong>{inverter.EQPDescricao ?? inverter.EQPCodigo}</strong>. As regras de todas as turmas são regravadas neste
                            equipamento com os portais trocados e a validação volta a ficar pendente.
                        </p>
                        <div className="flex justify-end gap-3">
                            <Button size="sm" variant="outline" onClick={() => setInverter(null)}>
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    const item = inverter;
                                    setInverter(null);
                                    atualizar(item, { invertido: !item.sentido.invertido }, "Sentidos invertidos");
                                }}
                            >
                                {inverter.sentido.invertido ? "Desfazer inversão" : "Inverter"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={!!leitura} onClose={() => setLeitura(null)} className="w-full max-w-2xl rounded-2xl p-6">
                {leitura && (
                    <div className="max-h-[80vh] space-y-4 overflow-y-auto pr-1 text-sm">
                        <h4 className="pr-12 text-base font-semibold text-gray-800 dark:text-white/90">
                            Leitura de {leitura.item.EQPDescricao ?? leitura.item.EQPCodigo}
                        </h4>
                        {leitura.dados.alertas.length > 0 ? (
                            <ul className="space-y-1 rounded-xl bg-warning-50 p-3 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                {leitura.dados.alertas.map((a) => (
                                    <li key={a}>{a}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="rounded-xl bg-success-50 p-3 text-success-700 dark:bg-success-500/10 dark:text-success-400">
                                Nenhum alerta na configuração da catraca.
                            </p>
                        )}
                        <section>
                            <h5 className="mb-1 text-xs font-medium uppercase text-gray-500">Catraca (sec_box)</h5>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                <CatraResumo catra={leitura.dados.leitura.catra} />
                            </div>
                        </section>
                        <section>
                            <h5 className="mb-1 text-xs font-medium uppercase text-gray-500">Áreas</h5>
                            <p className="text-gray-600 dark:text-gray-400">
                                {leitura.dados.leitura.areas.map((a) => `#${a.id} ${a.nome}`).join(" · ") || "Nenhuma área"}
                            </p>
                        </section>
                        <section>
                            <h5 className="mb-1 text-xs font-medium uppercase text-gray-500">Portais</h5>
                            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                                {leitura.dados.leitura.portais.map((p) => {
                                    const uso = SENTIDOS.find((s) => leitura.dados.sentido.portais?.[s] === p.id);
                                    return (
                                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                            <span className="text-gray-700 dark:text-gray-300">
                                                <span className="font-mono">#{p.id}</span> {p.nome}
                                                <span className="block text-xs text-gray-500">
                                                    {nomeDe(p.areaFromId, leitura.dados)} → {nomeDe(p.areaToId, leitura.dados)}
                                                </span>
                                            </span>
                                            {uso && <span className={`rounded-lg px-2 py-0.5 text-xs ${COR_SENTIDO[uso].chip}`}>{SENTIDO_INFO[uso].titulo}</span>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => setLeitura(null)}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
