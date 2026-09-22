"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useToast } from "@/context/ToastContext";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import DiagramaAcesso from "./DiagramaAcesso";
import HostAcessoBanner from "./HostAcessoBanner";
import {
    AVISO_FORMA,
    corDaArea,
    resumirJanelas,
    type CandidatoDepartamento,
    type DepartamentoItem,
    type EspelhoAcesso,
    type RespostaCandidatos,
    type RespostaComEspelho,
} from "./acesso-tipos";

interface Props {
    institutionId: number;
    equipmentId: number;
    podeEditar: boolean;
}

/** Uma regra sendo editada: um horário e as áreas em que ele vale neste departamento. */
interface RegraForm {
    HORCodigo: number;
    areas: Set<number>;
}

interface ResultadoRegras {
    criadas: number;
    atualizadas: number;
    removidas: number;
    desligadas: number;
    avisos: string[];
    espelho: EspelhoAcesso;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Aba "Departamentos": cada departamento e suas regras.
 *
 * Uma regra = um horário + as áreas em que ele vale. Ao adicionar um horário, as áreas vinculadas a
 * ele na aba Áreas já vêm marcadas, e dá para desmarcar — o mesmo horário pode liberar entrada e
 * saída num departamento e só a entrada noutro.
 */
export default function AcessoDepartamentosTab({ institutionId, equipmentId, podeEditar }: Props) {
    const { showToast } = useToast();
    const [espelho, setEspelho] = useState<EspelhoAcesso | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [ocupado, setOcupado] = useState(false);

    const [novo, setNovo] = useState<string | null>(null);
    const [renomeando, setRenomeando] = useState<{ dep: DepartamentoItem; nome: string } | null>(null);
    const [editor, setEditor] = useState<{ dep: DepartamentoItem; regras: RegraForm[] } | null>(null);
    const [diagrama, setDiagrama] = useState<DepartamentoItem | null>(null);
    const [avisos, setAvisos] = useState<string[] | null>(null);
    const [adocao, setAdocao] = useState<RespostaCandidatos | null>(null);
    /** DEQIdDevice → DEPCodigo escolhido ("" = criar novo com o nome do grupo). */
    const [escolha, setEscolha] = useState<Record<string, string>>({});

    const base = `/instituicao/${institutionId}/equipamento/${equipmentId}/acesso`;

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setEspelho(await apiGet<EspelhoAcesso>(base));
        } catch (e) {
            showToast("error", "Erro ao carregar departamentos", msg(e));
        } finally {
            setCarregando(false);
        }
    }, [base, showToast]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const areas = espelho?.areas ?? [];
    const horarios = espelho?.horarios ?? [];
    const departamentos = espelho?.departamentos ?? [];
    const nomeArea = new Map(areas.map((a) => [a.ARECodigo, a.ARENome]));
    const indiceArea = new Map(areas.map((a, i) => [a.ARECodigo, i]));

    const executar = async (acao: () => Promise<RespostaComEspelho>, sucesso: string) => {
        setOcupado(true);
        try {
            const r = await acao();
            setEspelho(r.espelho);
            showToast("success", sucesso);
            return true;
        } catch (e) {
            showToast("error", "Não foi possível salvar", msg(e));
            return false;
        } finally {
            setOcupado(false);
        }
    };

    const criar = async () => {
        if (!novo?.trim()) return;
        if (await executar(() => apiPost<RespostaComEspelho>(`${base}/departamento`, { nome: novo.trim() }), "Departamento criado")) {
            setNovo(null);
        }
    };

    const renomear = async () => {
        if (!renomeando?.nome.trim()) return;
        const ok = await executar(
            () =>
                apiPut<RespostaComEspelho>(`${base}/departamento/${renomeando.dep.DEQCodigo}`, {
                    nome: renomeando.nome.trim(),
                }),
            "Departamento renomeado no equipamento",
        );
        if (ok) setRenomeando(null);
    };

    const revisar = (dep: DepartamentoItem) =>
        executar(
            () => apiPost<RespostaComEspelho>(`${base}/departamento/${dep.DEQCodigo}/revisar`, {}),
            "Departamento marcado como revisado",
        );

    const abrirAdocao = async () => {
        setOcupado(true);
        try {
            const r = await apiGet<RespostaCandidatos>(`${base}/departamento/candidatos`);
            setAdocao(r);
            setEscolha(
                Object.fromEntries(
                    r.candidatos.map((c) => [
                        c.DEQIdDevice,
                        c.DEPSugerido && !c.sugestaoOcupada ? String(c.DEPSugerido.DEPCodigo) : "",
                    ]),
                ),
            );
        } catch (e) {
            showToast("error", "Não foi possível listar os candidatos", msg(e));
        } finally {
            setOcupado(false);
        }
    };

    const adotar = async (c: CandidatoDepartamento) => {
        const dep = escolha[c.DEQIdDevice];
        setOcupado(true);
        try {
            const r = await apiPost<RespostaComEspelho>(`${base}/departamento/adotar`, {
                DEQIdDevice: c.DEQIdDevice,
                ...(dep ? { DEPCodigo: Number(dep) } : { DEPNome: c.nome }),
            });
            setEspelho(r.espelho);
            setAdocao((atual) =>
                atual ? { ...atual, candidatos: atual.candidatos.filter((x) => x.DEQIdDevice !== c.DEQIdDevice) } : atual,
            );
            showToast("success", "Departamento adotado", `${c.nome} — confira as regras e marque como revisado.`);
        } catch (e) {
            showToast("error", "Não foi possível adotar", msg(e));
        } finally {
            setOcupado(false);
        }
    };

    const desadotar = async (dep: DepartamentoItem) => {
        if (
            !confirm(
                `Desadotar "${dep.DEQNome}"? O departamento e as regras continuam no equipamento — o projeto apenas deixa de gerenciá-los.`,
            )
        )
            return;
        await executar(
            () => apiDelete<RespostaComEspelho>(`${base}/departamento/${dep.DEQCodigo}`),
            "Adoção desfeita",
        );
    };

    const abrirEditor = (dep: DepartamentoItem) =>
        setEditor({
            dep,
            regras: dep.regras.map((r) => ({ HORCodigo: r.HORCodigo, areas: new Set(r.areas) })),
        });

    /** Ao adicionar, as áreas do horário vêm marcadas — e podem ser desmarcadas aqui. */
    const adicionarHorario = (HORCodigo: number) => {
        if (!editor) return;
        if (editor.regras.some((r) => r.HORCodigo === HORCodigo)) return;
        const horario = horarios.find((h) => h.HORCodigo === HORCodigo);
        setEditor({
            ...editor,
            regras: [...editor.regras, { HORCodigo, areas: new Set(horario?.areas ?? []) }],
        });
    };

    const salvarRegras = async () => {
        if (!editor) return;
        setOcupado(true);
        try {
            const r = await apiPut<ResultadoRegras>(`${base}/departamento/${editor.dep.DEQCodigo}/regras`, {
                regras: editor.regras.map((x) => ({ HORCodigo: x.HORCodigo, ARECodigos: [...x.areas] })),
            });
            setEspelho(r.espelho);
            setEditor(null);
            if (r.avisos.length) setAvisos(r.avisos);
            showToast(
                "success",
                "Regras salvas",
                `${r.criadas} criada(s), ${r.atualizadas} atualizada(s), ${r.removidas} removida(s).`,
            );
        } catch (e) {
            showToast("error", "Não foi possível salvar as regras", msg(e));
        } finally {
            setOcupado(false);
        }
    };

    if (carregando) return <p className="py-10 text-center text-gray-400">Carregando...</p>;

    return (
        <div className="space-y-5">
            <HostAcessoBanner institutionId={institutionId} equipmentId={equipmentId} hosts={espelho?.hosts ?? []} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Departamentos</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Cada regra é um horário e as áreas em que ele vale. Quem está no departamento entra numa área se
                        alguma regra liberar aquela área naquele momento.
                    </p>
                </div>
                {podeEditar && (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={abrirAdocao} disabled={ocupado}>
                            Adotar existentes
                        </Button>
                        <Button onClick={() => setNovo("")} disabled={ocupado}>
                            Novo departamento
                        </Button>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {departamentos.map((dep) => (
                    <div
                        key={dep.DEQCodigo}
                        className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-medium text-gray-800 dark:text-white/90">
                                    {dep.DEQNome}
                                    <span className="ml-2 font-mono text-xs text-gray-400">#{dep.DEQIdDevice}</span>
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Departamento da instituição: {dep.DEPNome}
                                    {dep.DEPNome !== dep.DEQNome && " (nome diferente do equipamento)"}
                                </p>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {!dep.revisadoEm && (
                                        <Badge size="sm" color="warning">
                                            não revisado
                                        </Badge>
                                    )}
                                    {dep.ultimoErro && (
                                        <Badge size="sm" color="error">
                                            {dep.ultimoErro}
                                        </Badge>
                                    )}
                                    {!dep.regras.length && (
                                        <Badge size="sm" color="error">
                                            sem regra — ninguém passa
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => setDiagrama(dep)}>
                                    Diagrama
                                </Button>
                                {podeEditar && (
                                    <>
                                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => abrirEditor(dep)}>
                                            Regras
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={ocupado}
                                            onClick={() => setRenomeando({ dep, nome: dep.DEQNome })}
                                        >
                                            Renomear
                                        </Button>
                                        {!dep.revisadoEm && (
                                            <Button size="sm" disabled={ocupado} onClick={() => revisar(dep)}>
                                                Marcar revisado
                                            </Button>
                                        )}
                                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => desadotar(dep)}>
                                            Desadotar
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>

                        {dep.regras.length > 0 && (
                            <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
                                {dep.regras.map((r) => {
                                    const h = horarios.find((x) => x.HORCodigo === r.HORCodigo);
                                    return (
                                        <li key={r.DRGCodigo} className="flex flex-wrap items-baseline gap-2">
                                            <span className="font-medium text-gray-700 dark:text-gray-200">
                                                {h?.HORNome ?? `#${r.HORCodigo}`}
                                            </span>
                                            <span className="text-xs text-gray-400">
                                                {h ? resumirJanelas(h.janelas).join(" · ") : ""}
                                            </span>
                                            <span className="flex flex-wrap gap-1">
                                                {r.areas.length ? (
                                                    r.areas.map((a) => (
                                                        <span
                                                            key={a}
                                                            className={`rounded px-1.5 py-0.5 text-xs ${corDaArea(indiceArea.get(a) ?? 0).chip}`}
                                                        >
                                                            {nomeArea.get(a) ?? `#${a}`}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-warning-600">sem área — não libera nada</span>
                                                )}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                ))}
                {!departamentos.length && (
                    <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                        Nenhum departamento adotado neste equipamento.
                    </p>
                )}
            </div>

            {/* novo departamento */}
            <Modal isOpen={novo !== null} onClose={() => setNovo(null)} className="w-full max-w-md rounded-2xl p-6">
                <div className="space-y-4">
                    <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">Novo departamento</h4>
                    <div>
                        <Label htmlFor="dep-nome">Nome no equipamento</Label>
                        <InputField id="dep-nome" value={novo ?? ""} onChange={(e) => setNovo(e.target.value)} />
                        <p className="mt-1 text-xs text-gray-500">
                            Máximo de 15 caracteres — o firmware trunca nomes maiores.
                        </p>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button size="sm" variant="outline" onClick={() => setNovo(null)} disabled={ocupado}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={criar} disabled={ocupado || !novo?.trim()}>
                            {ocupado ? "Criando..." : "Criar"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* renomear */}
            <Modal isOpen={!!renomeando} onClose={() => setRenomeando(null)} className="w-full max-w-md rounded-2xl p-6">
                {renomeando && (
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                            Renomear no equipamento
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Muda só o nome do grupo nesta catraca. O departamento da instituição continua{" "}
                            <strong>{renomeando.dep.DEPNome}</strong> — é ele que a turma aponta.
                        </p>
                        <InputField
                            value={renomeando.nome}
                            onChange={(e) => setRenomeando({ ...renomeando, nome: e.target.value })}
                        />
                        <div className="flex justify-end gap-3">
                            <Button size="sm" variant="outline" onClick={() => setRenomeando(null)} disabled={ocupado}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={renomear} disabled={ocupado || !renomeando.nome.trim()}>
                                {ocupado ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* editor de regras */}
            <Modal isOpen={!!editor} onClose={() => setEditor(null)} className="w-full max-w-3xl rounded-2xl">
                {editor && (
                    <div className="flex max-h-[90vh] flex-col">
                        <div className="shrink-0 border-b border-gray-100 px-6 py-4 pr-16 dark:border-gray-800">
                            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                                Regras de {editor.dep.DEQNome}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                As áreas de cada horário já vêm marcadas. Desmarque para este horário valer só em parte delas.
                            </p>
                        </div>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                            {editor.regras.map((regra, i) => {
                                const horario = horarios.find((h) => h.HORCodigo === regra.HORCodigo);
                                return (
                                    <div key={regra.HORCodigo} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <div>
                                                <p className="font-medium text-gray-800 dark:text-white/90">
                                                    {horario?.HORNome ?? `#${regra.HORCodigo}`}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {horario ? resumirJanelas(horario.janelas).join(" · ") : ""}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    setEditor({ ...editor, regras: editor.regras.filter((_, x) => x !== i) })
                                                }
                                            >
                                                Remover
                                            </Button>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {areas.map((a, idx) => {
                                                const marcada = regra.areas.has(a.ARECodigo);
                                                const doHorario = horario?.areas.includes(a.ARECodigo);
                                                return (
                                                    <button
                                                        key={a.ARECodigo}
                                                        type="button"
                                                        title={doHorario ? "Vinculada a este horário na aba Áreas" : "Fora das áreas deste horário"}
                                                        onClick={() => {
                                                            const areasNovas = new Set(regra.areas);
                                                            if (marcada) areasNovas.delete(a.ARECodigo);
                                                            else areasNovas.add(a.ARECodigo);
                                                            setEditor({
                                                                ...editor,
                                                                regras: editor.regras.map((r, x) =>
                                                                    x === i ? { ...r, areas: areasNovas } : r,
                                                                ),
                                                            });
                                                        }}
                                                        className={`rounded-lg border px-3 py-1.5 text-sm ${
                                                            marcada
                                                                ? `${corDaArea(idx).chip} ${corDaArea(idx).borda}`
                                                                : "border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400"
                                                        } ${!doHorario ? "border-dashed" : ""}`}
                                                    >
                                                        {marcada ? "✓ " : ""}
                                                        {a.ARENome}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {!regra.areas.size && (
                                            <p className="mt-2 text-xs text-warning-600">
                                                Sem área marcada esta regra não libera sentido nenhum.
                                            </p>
                                        )}
                                    </div>
                                );
                            })}

                            {!editor.regras.length && (
                                <p className="rounded-xl bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
                                    Sem nenhuma regra, ninguém deste departamento passa na catraca.
                                </p>
                            )}

                            <div>
                                <Label htmlFor="add-horario">Adicionar horário</Label>
                                <select
                                    id="add-horario"
                                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                    value=""
                                    onChange={(e) => e.target.value && adicionarHorario(Number(e.target.value))}
                                >
                                    <option value="">Selecione…</option>
                                    {horarios
                                        .filter((h) => !editor.regras.some((r) => r.HORCodigo === h.HORCodigo))
                                        .map((h) => (
                                            <option key={h.HORCodigo} value={h.HORCodigo}>
                                                {h.HORNome} — {resumirJanelas(h.janelas).join(" · ")}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
                            <Button size="sm" variant="outline" onClick={() => setEditor(null)} disabled={ocupado}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={salvarRegras} disabled={ocupado}>
                                {ocupado ? "Salvando..." : "Salvar regras"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* diagrama */}
            <Modal isOpen={!!diagrama} onClose={() => setDiagrama(null)} className="w-full max-w-3xl rounded-2xl">
                {diagrama && (
                    <div className="flex max-h-[90vh] flex-col">
                        <div className="shrink-0 border-b border-gray-100 px-6 py-4 pr-16 dark:border-gray-800">
                            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                                O que {diagrama.DEQNome} libera
                            </h4>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                            <DiagramaAcesso
                                departamento={diagrama}
                                areas={areas}
                                portais={espelho?.portais ?? []}
                                horarios={horarios}
                            />
                        </div>
                    </div>
                )}
            </Modal>

            {/* adoção de departamentos que já existem na catraca */}
            <Modal isOpen={!!adocao} onClose={() => setAdocao(null)} className="w-full max-w-3xl rounded-2xl">
                {adocao && (
                    <div className="flex max-h-[90vh] flex-col">
                        <div className="shrink-0 border-b border-gray-100 px-6 py-4 pr-16 dark:border-gray-800">
                            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                                Departamentos no equipamento ainda não adotados
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Adotar não muda nada na catraca — só passa a gerenciar daqui o que já existe lá.
                            </p>
                        </div>

                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
                            {adocao.candidatos.map((c) => (
                                <div key={c.DEQIdDevice} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-medium text-gray-800 dark:text-white/90">
                                                {c.nome}
                                                <span className="ml-2 font-mono text-xs text-gray-400">#{c.DEQIdDevice}</span>
                                            </p>
                                            {c.regras.length ? (
                                                <ul className="mt-1.5 space-y-1 text-sm">
                                                    {c.regras.map((r) => (
                                                        <li key={r.idRegra}>
                                                            <span className="text-gray-700 dark:text-gray-200">
                                                                {r.horarios.map((h) => h.nome).join(", ") || "sem horário"}
                                                            </span>
                                                            <span className="text-gray-400">
                                                                {" "}
                                                                → {r.areas.map((a) => a.nome).join(", ") || "nenhuma área"}
                                                            </span>
                                                            {AVISO_FORMA[r.forma] && (
                                                                <span className="ml-1 text-xs text-warning-600">
                                                                    ({AVISO_FORMA[r.forma]})
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="mt-1 text-sm text-gray-400">
                                                    Sem regra de permissão — ninguém deste departamento passa.
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex shrink-0 items-end gap-2">
                                            <div>
                                                <Label htmlFor={`dep-${c.DEQIdDevice}`}>Departamento da instituição</Label>
                                                <select
                                                    id={`dep-${c.DEQIdDevice}`}
                                                    className="h-11 min-w-52 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                                    value={escolha[c.DEQIdDevice] ?? ""}
                                                    onChange={(e) =>
                                                        setEscolha({ ...escolha, [c.DEQIdDevice]: e.target.value })
                                                    }
                                                >
                                                    <option value="">Criar &quot;{c.nome}&quot;</option>
                                                    {adocao.departamentos.map((d) => (
                                                        <option key={d.DEPCodigo} value={d.DEPCodigo} disabled={d.adotadoAqui}>
                                                            {d.DEPNome}
                                                            {d.adotadoAqui ? " (já usado neste equipamento)" : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <Button size="sm" disabled={ocupado} onClick={() => adotar(c)}>
                                                Adotar
                                            </Button>
                                        </div>
                                    </div>

                                    {c.DEPSugerido && c.sugestaoOcupada && (
                                        <p className="mt-2 text-xs text-warning-600">
                                            Existe um departamento &quot;{c.DEPSugerido.DEPNome}&quot; com este nome, mas ele já
                                            está vinculado a outro grupo deste equipamento.
                                        </p>
                                    )}
                                </div>
                            ))}

                            {!adocao.candidatos.length && (
                                <p className="py-6 text-center text-sm text-gray-400">
                                    Todos os departamentos do equipamento já estão adotados.
                                </p>
                            )}
                        </div>

                        <div className="flex shrink-0 justify-end border-t border-gray-100 px-6 py-4 dark:border-gray-800">
                            <Button size="sm" onClick={() => setAdocao(null)}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* avisos da gravação */}
            <Modal isOpen={!!avisos} onClose={() => setAvisos(null)} className="w-full max-w-lg rounded-2xl p-6">
                {avisos && (
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                            Regras salvas, com ressalvas
                        </h4>
                        <ul className="list-inside list-disc space-y-1 rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                            {avisos.map((a) => (
                                <li key={a}>{a}</li>
                            ))}
                        </ul>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => setAvisos(null)}>
                                Entendi
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
