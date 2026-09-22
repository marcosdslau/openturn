"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useToast } from "@/context/ToastContext";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import HostAcessoBanner from "./HostAcessoBanner";
import {
    DIAS_CURTOS,
    hhmmDeSegundos,
    type EspelhoAcesso,
    type HorarioItem,
    type RespostaComEspelho,
} from "./acesso-tipos";

interface Props {
    institutionId: number;
    equipmentId: number;
    podeEditar: boolean;
}

interface FaixaForm {
    inicio: string;
    fim: string;
    dias: boolean[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const faixaVazia = (): FaixaForm => ({ inicio: "07:00", fim: "08:00", dias: [false, true, true, true, true, true, false] });

/**
 * Aba "Horários": os `time_zones` do equipamento e as áreas cuja ENTRADA cada um libera.
 *
 * Escreve pelos endpoints tipados (`/acesso/horario`), não mais por `.fcgi` cru: cada gravação
 * relê o equipamento e reconcilia o espelho, senão o retrato local nasce desatualizado.
 */
export default function AcessoHorariosTab({ institutionId, equipmentId, podeEditar }: Props) {
    const { showToast } = useToast();
    const [espelho, setEspelho] = useState<EspelhoAcesso | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [ocupado, setOcupado] = useState(false);
    const [form, setForm] = useState<{
        horario: HorarioItem | null;
        nome: string;
        faixas: FaixaForm[];
        areas: Set<number>;
    } | null>(null);

    const base = `/instituicao/${institutionId}/equipamento/${equipmentId}/acesso`;

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setEspelho(await apiGet<EspelhoAcesso>(base));
        } catch (e) {
            showToast("error", "Erro ao carregar horários", msg(e));
        } finally {
            setCarregando(false);
        }
    }, [base, showToast]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    const horarios = espelho?.horarios ?? [];
    const areas = espelho?.areas ?? [];

    const abrirNovo = () =>
        setForm({ horario: null, nome: "", faixas: [faixaVazia()], areas: new Set() });

    const abrirEdicao = (h: HorarioItem) =>
        setForm({
            horario: h,
            nome: h.HORNome,
            faixas: h.janelas.length
                ? h.janelas.map((j) => ({
                      inicio: hhmmDeSegundos(j.inicioSeg),
                      fim: hhmmDeSegundos(j.fimSeg),
                      dias: [...j.dias],
                  }))
                : [faixaVazia()],
            areas: new Set(h.areas),
        });

    const salvar = async () => {
        if (!form) return;
        const corpo = {
            nome: form.nome.trim(),
            janelas: form.faixas.map((f) => ({ inicio: f.inicio, fim: f.fim, dias: f.dias })),
            ARECodigos: [...form.areas],
        };
        setOcupado(true);
        try {
            const r = form.horario
                ? await apiPut<RespostaComEspelho>(`${base}/horario/${form.horario.HORCodigo}`, corpo)
                : await apiPost<RespostaComEspelho>(`${base}/horario`, corpo);
            setEspelho(r.espelho);
            showToast("success", form.horario ? "Horário atualizado" : "Horário criado", corpo.nome);
            setForm(null);
        } catch (e) {
            showToast("error", "Não foi possível salvar", msg(e));
        } finally {
            setOcupado(false);
        }
    };

    const remover = async (h: HorarioItem) => {
        if (!confirm(`Remover o horário "${h.HORNome}" e todas as suas faixas do equipamento?`)) return;
        setOcupado(true);
        try {
            const r = await apiDelete<RespostaComEspelho>(`${base}/horario/${h.HORCodigo}`);
            setEspelho(r.espelho);
            showToast("success", "Horário removido", h.HORNome);
        } catch (e) {
            // Horário em uso por alguma regra volta 409 com os nomes das regras.
            showToast("error", "Não foi possível remover", msg(e));
        } finally {
            setOcupado(false);
        }
    };

    const alterarFaixa = (i: number, campo: Partial<FaixaForm>) => {
        if (!form) return;
        const faixas = form.faixas.map((f, idx) => (idx === i ? { ...f, ...campo } : f));
        setForm({ ...form, faixas });
    };

    if (carregando) return <p className="py-10 text-center text-gray-400">Carregando...</p>;

    const nomeArea = new Map(areas.map((a) => [a.ARECodigo, a.ARENome]));

    return (
        <div className="space-y-5">
            <HostAcessoBanner institutionId={institutionId} equipmentId={equipmentId} hosts={espelho?.hosts ?? []} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Horários</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Um horário define <em>quando</em>. As áreas definem <em>onde</em> — marcar uma área aqui significa que
                        este horário libera a <strong>entrada</strong> nela.
                    </p>
                </div>
                {podeEditar && (
                    <Button onClick={abrirNovo} disabled={ocupado}>
                        Novo horário
                    </Button>
                )}
            </div>

            {!areas.length && (
                <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                    Nenhuma área conhecida ainda. Abra a aba <strong>Áreas</strong> e leia a configuração do equipamento
                    primeiro — sem área, o horário não tem onde valer.
                </p>
            )}

            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead>
                        <tr>
                            {["Horário", "Faixas", "Libera entrada em", ""].map((h) => (
                                <th
                                    key={h}
                                    className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {horarios.map((h) => (
                            <tr key={h.HORCodigo} className="align-top">
                                <td className="px-4 py-3">
                                    <p className="font-medium text-gray-800 dark:text-white/90">{h.HORNome}</p>
                                    <p className="font-mono text-xs text-gray-400">#{h.HORIdDevice} no equipamento</p>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                    {h.janelas.length ? (
                                        <ul className="space-y-0.5">
                                            {h.janelas.map((j) => (
                                                <li key={j.HRJCodigo}>
                                                    <span className="font-mono">
                                                        {hhmmDeSegundos(j.inicioSeg)}–{hhmmDeSegundos(j.fimSeg)}
                                                    </span>{" "}
                                                    <span className="text-xs text-gray-400">
                                                        {j.dias
                                                            .map((a, i) => (a ? DIAS_CURTOS[i] : null))
                                                            .filter(Boolean)
                                                            .join(" ")}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <span className="text-gray-400">— sem faixas</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    {h.areas.length ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {h.areas.map((c) => (
                                                <span
                                                    key={c}
                                                    className="rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                                                >
                                                    {nomeArea.get(c) ?? `#${c}`}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <Badge size="sm" color="warning">
                                            nenhuma área
                                        </Badge>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {podeEditar && (
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => abrirEdicao(h)}>
                                                Editar
                                            </Button>
                                            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => remover(h)}>
                                                Remover
                                            </Button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {!horarios.length && (
                            <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                                    Nenhum horário no equipamento.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={!!form} onClose={() => setForm(null)} className="w-full max-w-2xl rounded-2xl">
                {form && (
                    <div className="flex max-h-[90vh] flex-col">
                        <div className="shrink-0 border-b border-gray-100 px-6 py-4 pr-16 dark:border-gray-800">
                            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                                {form.horario ? `Editar "${form.horario.HORNome}"` : "Novo horário"}
                            </h4>
                        </div>

                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                            <div>
                                <Label htmlFor="hor-nome">Nome no equipamento</Label>
                                <InputField
                                    id="hor-nome"
                                    value={form.nome}
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Máximo de 15 caracteres — o firmware trunca nomes maiores, e letras acentuadas contam como 2.
                                </p>
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <h5 className="font-medium text-gray-700 dark:text-white/90">Faixas</h5>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setForm({ ...form, faixas: [...form.faixas, faixaVazia()] })}
                                    >
                                        Adicionar faixa
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {form.faixas.map((f, i) => (
                                        <div key={i} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                                            <div className="flex flex-wrap items-end gap-3">
                                                <div>
                                                    <Label htmlFor={`ini-${i}`}>Início</Label>
                                                    <input
                                                        id={`ini-${i}`}
                                                        type="time"
                                                        className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700"
                                                        value={f.inicio}
                                                        onChange={(e) => alterarFaixa(i, { inicio: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor={`fim-${i}`}>Fim</Label>
                                                    <input
                                                        id={`fim-${i}`}
                                                        type="time"
                                                        className="h-11 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700"
                                                        value={f.fim === "24:00" ? "23:59" : f.fim}
                                                        onChange={(e) => alterarFaixa(i, { fim: e.target.value })}
                                                    />
                                                </div>
                                                {form.faixas.length > 1 && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            setForm({ ...form, faixas: form.faixas.filter((_, x) => x !== i) })
                                                        }
                                                    >
                                                        Remover
                                                    </Button>
                                                )}
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {DIAS_CURTOS.map((d, idx) => (
                                                    <button
                                                        key={d}
                                                        type="button"
                                                        onClick={() =>
                                                            alterarFaixa(i, {
                                                                dias: f.dias.map((v, x) => (x === idx ? !v : v)),
                                                            })
                                                        }
                                                        className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                                                            f.dias[idx]
                                                                ? "bg-brand-500 text-white"
                                                                : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                                                        }`}
                                                    >
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                            {f.fim <= f.inicio && (
                                                <p className="mt-2 text-xs text-warning-600">
                                                    Cruza a meia-noite: vale até o fim do dia marcado e retoma no dia seguinte.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h5 className="mb-2 font-medium text-gray-700 dark:text-white/90">Libera a entrada em</h5>
                                {areas.length ? (
                                    <div className="flex flex-wrap gap-2">
                                        {areas.map((a) => {
                                            const marcada = form.areas.has(a.ARECodigo);
                                            return (
                                                <button
                                                    key={a.ARECodigo}
                                                    type="button"
                                                    onClick={() => {
                                                        const areas = new Set(form.areas);
                                                        if (marcada) areas.delete(a.ARECodigo);
                                                        else areas.add(a.ARECodigo);
                                                        setForm({ ...form, areas });
                                                    }}
                                                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                                                        marcada
                                                            ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                                                            : "border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400"
                                                    }`}
                                                >
                                                    {marcada ? "✓ " : ""}
                                                    {a.ARENome}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400">Nenhuma área conhecida neste equipamento.</p>
                                )}
                            </div>
                        </div>

                        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-gray-800">
                            <Button size="sm" variant="outline" onClick={() => setForm(null)} disabled={ocupado}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={salvar} disabled={ocupado || !form.nome.trim() || !form.faixas.length}>
                                {ocupado ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
