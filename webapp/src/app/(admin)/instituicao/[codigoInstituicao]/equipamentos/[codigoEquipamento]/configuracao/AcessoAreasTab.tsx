"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import HostAcessoBanner from "./HostAcessoBanner";
import {
    departamentosSemRegraNaArea,
    portalDeEntrada,
    resumirJanelas,
    type AreaItem,
    type DepartamentoItem,
    type EspelhoAcesso,
    type HorarioItem,
    type RespostaComEspelho,
    type ResumoLeitura,
} from "./acesso-tipos";

interface Props {
    institutionId: number;
    equipmentId: number;
    podeEditar: boolean;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Aba "Áreas": as áreas do equipamento, os portais entre elas e quais horários liberam a entrada
 * em cada uma.
 *
 * O rótulo é sempre "Entrada na Área X", nunca "Área X" sozinho. Área é um nó; o portal é a aresta
 * dirigida, e é ele que carrega o sentido — nome e sentido divergentes já custaram um dia de
 * depuração (docs/controle-por-turma/README.md §8.2).
 */
export default function AcessoAreasTab({ institutionId, equipmentId, podeEditar }: Props) {
    const { showToast } = useToast();
    const [espelho, setEspelho] = useState<EspelhoAcesso | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [ocupado, setOcupado] = useState(false);

    const [areaEdit, setAreaEdit] = useState<{ area: AreaItem | null; nome: string } | null>(null);
    const [portalNovo, setPortalNovo] = useState<{ de: number | ""; para: number | ""; nome: string } | null>(null);
    const [vinculo, setVinculo] = useState<{ area: AreaItem; marcados: Set<number> } | null>(null);
    /** Quem não passa pelo portal recém-criado, até alguém configurar uma regra. */
    const [semRegra, setSemRegra] = useState<{ area: string; departamentos: Array<{ nome: string }> } | null>(null);

    const base = `/instituicao/${institutionId}/equipamento/${equipmentId}/acesso`;

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setEspelho(await apiGet<EspelhoAcesso>(base));
        } catch (e) {
            showToast("error", "Erro ao carregar a configuração de acesso", msg(e));
        } finally {
            setCarregando(false);
        }
    }, [base, showToast]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    /** Toda escrita devolve o espelho reconciliado: aproveita em vez de reconsultar. */
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

    const lerDoEquipamento = async () => {
        setOcupado(true);
        try {
            const r = await apiPost<ResumoLeitura>(`${base}/ler`, {}, { timeoutMs: 5 * 60_000 });
            await carregar();
            if (r.observacoes.leituraVazia) {
                showToast("warning", "Leitura vazia", "O equipamento não devolveu nenhum objeto; o espelho foi preservado.");
            } else {
                showToast(
                    "success",
                    "Configuração lida",
                    `${r.areas.criadas + r.areas.atualizadas} área(s), ${r.portais.criados + r.portais.atualizados} portal(is), ` +
                        `${r.horarios.criados + r.horarios.atualizados} horário(s).`,
                );
            }
        } catch (e) {
            showToast("error", "Não foi possível ler o equipamento", msg(e));
        } finally {
            setOcupado(false);
        }
    };

    const areas = useMemo(() => espelho?.areas ?? [], [espelho]);
    const portais = espelho?.portais ?? [];
    const horarios = espelho?.horarios ?? [];
    const departamentos = espelho?.departamentos ?? [];
    const nomeArea = useMemo(() => new Map(areas.map((a) => [a.ARECodigo, a.ARENome])), [areas]);

    const horariosDaArea = (ARECodigo: number) => horarios.filter((h) => h.areas.includes(ARECodigo));

    const salvarArea = async () => {
        if (!areaEdit) return;
        const nome = areaEdit.nome.trim();
        if (!nome) return;
        const ok = await executar(
            () =>
                areaEdit.area
                    ? apiPut<RespostaComEspelho>(`${base}/area/${areaEdit.area.ARECodigo}`, { nome })
                    : apiPost<RespostaComEspelho>(`${base}/area`, { nome }),
            areaEdit.area ? "Área renomeada" : "Área criada",
        );
        if (ok) setAreaEdit(null);
    };

    const salvarPortal = async () => {
        if (!portalNovo || portalNovo.de === "" || portalNovo.para === "") return;
        setOcupado(true);
        try {
            const r = await apiPost<RespostaComEspelho & { departamentosSemRegra: Array<{ nome: string }> }>(
                `${base}/portal`,
                {
                    areaDeCodigo: Number(portalNovo.de),
                    areaParaCodigo: Number(portalNovo.para),
                    ...(portalNovo.nome.trim() ? { nome: portalNovo.nome.trim() } : {}),
                },
            );
            setEspelho(r.espelho);
            setPortalNovo(null);
            // Portal novo nasce sem regra nenhuma: quem não for coberto não passa por ele.
            if (r.departamentosSemRegra?.length) {
                setSemRegra({
                    area: nomeArea.get(Number(portalNovo.para)) ?? "",
                    departamentos: r.departamentosSemRegra,
                });
            } else {
                showToast("success", "Portal criado");
            }
        } catch (e) {
            showToast("error", "Não foi possível criar o portal", msg(e));
        } finally {
            setOcupado(false);
        }
    };

    /** Vincular horário à área é editar o horário: um PUT por horário que mudou. */
    const salvarVinculos = async () => {
        if (!vinculo) return;
        const { area, marcados } = vinculo;
        const mudaram = horarios.filter((h) => h.areas.includes(area.ARECodigo) !== marcados.has(h.HORCodigo));
        if (!mudaram.length) {
            setVinculo(null);
            return;
        }
        setOcupado(true);
        try {
            let ultimo: EspelhoAcesso | null = null;
            for (const h of mudaram) {
                const areasNovas = marcados.has(h.HORCodigo)
                    ? [...h.areas, area.ARECodigo]
                    : h.areas.filter((a) => a !== area.ARECodigo);
                const r = await apiPut<RespostaComEspelho>(`${base}/horario/${h.HORCodigo}`, { ARECodigos: areasNovas });
                ultimo = r.espelho;
            }
            if (ultimo) setEspelho(ultimo);
            showToast("success", "Horários atualizados", `Entrada em "${area.ARENome}"`);
            setVinculo(null);
        } catch (e) {
            showToast("error", "Não foi possível salvar", msg(e));
            await carregar();
        } finally {
            setOcupado(false);
        }
    };

    if (carregando) {
        return <p className="py-10 text-center text-gray-400">Carregando...</p>;
    }

    if (!areas.length && !portais.length) {
        return (
            <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
                <p className="text-gray-600 dark:text-gray-300">
                    Nenhuma área conhecida ainda. Leia a configuração do equipamento para começar.
                </p>
                <p className="mx-auto mt-2 max-w-lg text-sm text-gray-400">
                    A leitura não altera nada na catraca — só traz para cá as áreas, portais e horários que já existem nela.
                </p>
                {podeEditar && (
                    <Button className="mt-5" onClick={lerDoEquipamento} disabled={ocupado}>
                        {ocupado ? "Lendo..." : "Ler do equipamento"}
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <HostAcessoBanner institutionId={institutionId} equipmentId={equipmentId} hosts={espelho?.hosts ?? []} />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Áreas e portais</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Área é um lugar; portal é a passagem entre duas áreas, com sentido. Um horário liberado numa área
                        vale para quem <strong>entra</strong> nela.
                    </p>
                </div>
                <div className="flex gap-2">
                    {podeEditar && (
                        <>
                            <Button variant="outline" onClick={lerDoEquipamento} disabled={ocupado}>
                                {ocupado ? "Lendo..." : "Ler do equipamento"}
                            </Button>
                            <Button onClick={() => setAreaEdit({ area: null, nome: "" })} disabled={ocupado}>
                                Nova área
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead>
                        <tr>
                            {["Área", "Entrada por", "Horários que liberam a entrada", "Quem não passa", ""].map((h) => (
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
                        {areas.map((a) => {
                            const portal = portalDeEntrada(portais, a.ARECodigo);
                            const daArea = horariosDaArea(a.ARECodigo);
                            return (
                                <tr key={a.ARECodigo} className="align-top">
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-800 dark:text-white/90">{a.ARENome}</p>
                                        <p className="font-mono text-xs text-gray-400">#{a.AREIdDevice} no equipamento</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {portal ? (
                                            <span className="text-gray-600 dark:text-gray-300">
                                                <span className="font-mono text-xs text-gray-400">#{portal.PTLIdDevice}</span>{" "}
                                                {nomeArea.get(portal.PTLAreaDeCodigo ?? -1) ?? "?"} <span aria-hidden>→</span>{" "}
                                                {a.ARENome}
                                            </span>
                                        ) : (
                                            <Badge size="sm" color="warning">
                                                sem portal de entrada
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {daArea.length ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {daArea.map((h) => (
                                                    <span
                                                        key={h.HORCodigo}
                                                        title={resumirJanelas(h.janelas).join("\n")}
                                                        className="rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                                                    >
                                                        {h.HORNome}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">— nenhum</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {(() => {
                                            const fora = departamentosSemRegraNaArea(departamentos, a.ARECodigo);
                                            if (!departamentos.length) return <span className="text-gray-400">—</span>;
                                            if (!fora.length) {
                                                return <span className="text-xs text-gray-400">todos passam</span>;
                                            }
                                            return (
                                                <span
                                                    title={fora.map((d: DepartamentoItem) => d.DEQNome).join(", ")}
                                                    className="cursor-help"
                                                >
                                                    <Badge size="sm" color="warning">
                                                        {fora.length} depto(s) sem regra
                                                    </Badge>
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {podeEditar && (
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={ocupado || !horarios.length}
                                                    onClick={() =>
                                                        setVinculo({
                                                            area: a,
                                                            marcados: new Set(daArea.map((h) => h.HORCodigo)),
                                                        })
                                                    }
                                                >
                                                    Horários
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={ocupado}
                                                    onClick={() => setAreaEdit({ area: a, nome: a.ARENome })}
                                                >
                                                    Renomear
                                                </Button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div>
                <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-medium text-gray-800 dark:text-white/90">Portais</h4>
                    {podeEditar && (
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={ocupado || areas.length < 2}
                            onClick={() => setPortalNovo({ de: "", para: "", nome: "" })}
                        >
                            Novo portal
                        </Button>
                    )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    {portais.map((p) => (
                        <div
                            key={p.PTLCodigo}
                            className="rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"
                        >
                            <p className="font-medium text-gray-800 dark:text-white/90">{p.PTLNome}</p>
                            <p className="text-gray-500 dark:text-gray-400">
                                {nomeArea.get(p.PTLAreaDeCodigo ?? -1) ?? <span className="text-warning-600">área desconhecida</span>}{" "}
                                <span aria-hidden>→</span>{" "}
                                {nomeArea.get(p.PTLAreaParaCodigo ?? -1) ?? <span className="text-warning-600">área desconhecida</span>}
                            </p>
                        </div>
                    ))}
                    {!portais.length && <p className="text-sm text-gray-400">Nenhum portal no equipamento.</p>}
                </div>
            </div>

            {/* criar/renomear área */}
            <Modal isOpen={!!areaEdit} onClose={() => setAreaEdit(null)} className="w-full max-w-md rounded-2xl p-6">
                {areaEdit && (
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                            {areaEdit.area ? `Renomear "${areaEdit.area.ARENome}"` : "Nova área"}
                        </h4>
                        <div>
                            <Label htmlFor="area-nome">Nome da área</Label>
                            <InputField
                                id="area-nome"
                                value={areaEdit.nome}
                                onChange={(e) => setAreaEdit({ ...areaEdit, nome: e.target.value })}
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button size="sm" variant="outline" onClick={() => setAreaEdit(null)} disabled={ocupado}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={salvarArea} disabled={ocupado || !areaEdit.nome.trim()}>
                                {ocupado ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* criar portal */}
            <Modal isOpen={!!portalNovo} onClose={() => setPortalNovo(null)} className="w-full max-w-md rounded-2xl p-6">
                {portalNovo && (
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">Novo portal</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Quem passa por este portal sai da primeira área e entra na segunda. O sentido é isto — o nome não
                            influencia nada no equipamento.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="portal-de">Sai de</Label>
                                <select
                                    id="portal-de"
                                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                    value={portalNovo.de}
                                    onChange={(e) => setPortalNovo({ ...portalNovo, de: e.target.value ? Number(e.target.value) : "" })}
                                >
                                    <option value="">Selecione…</option>
                                    {areas.map((a) => (
                                        <option key={a.ARECodigo} value={a.ARECodigo}>
                                            {a.ARENome}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="portal-para">Entra em</Label>
                                <select
                                    id="portal-para"
                                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                                    value={portalNovo.para}
                                    onChange={(e) =>
                                        setPortalNovo({ ...portalNovo, para: e.target.value ? Number(e.target.value) : "" })
                                    }
                                >
                                    <option value="">Selecione…</option>
                                    {areas.map((a) => (
                                        <option key={a.ARECodigo} value={a.ARECodigo}>
                                            {a.ARENome}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="portal-nome">Nome (opcional)</Label>
                            <InputField
                                id="portal-nome"
                                placeholder={
                                    portalNovo.para !== "" ? `Entrada ${nomeArea.get(Number(portalNovo.para)) ?? ""}` : "Entrada ..."
                                }
                                value={portalNovo.nome}
                                onChange={(e) => setPortalNovo({ ...portalNovo, nome: e.target.value })}
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button size="sm" variant="outline" onClick={() => setPortalNovo(null)} disabled={ocupado}>
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                onClick={salvarPortal}
                                disabled={
                                    ocupado ||
                                    portalNovo.de === "" ||
                                    portalNovo.para === "" ||
                                    portalNovo.de === portalNovo.para
                                }
                            >
                                {ocupado ? "Criando..." : "Criar portal"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* portal novo não libera ninguém até alguém configurar uma regra */}
            <Modal isOpen={!!semRegra} onClose={() => setSemRegra(null)} className="w-full max-w-lg rounded-2xl p-6">
                {semRegra && (
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                            Portal criado — mas ninguém passa por ele ainda
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Um portal novo não carrega regra nenhuma. Enquanto nenhum departamento tiver uma regra
                            liberando a entrada em <strong>{semRegra.area}</strong>, estes não passam por aqui:
                        </p>
                        <ul className="list-inside list-disc rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                            {semRegra.departamentos.map((d) => (
                                <li key={d.nome}>{d.nome}</li>
                            ))}
                        </ul>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Configure em <strong>Departamentos</strong>: adicione um horário e marque a área{" "}
                            {semRegra.area}. Atenção ao caso clássico — liberar só a entrada deixa a pessoa presa do
                            lado de dentro.
                        </p>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => setSemRegra(null)}>
                                Entendi
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* horários que liberam a entrada na área */}
            <Modal isOpen={!!vinculo} onClose={() => setVinculo(null)} className="w-full max-w-lg rounded-2xl p-6">
                {vinculo && (
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                            Entrada na área {vinculo.area.ARENome}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Marque os horários em que é permitido <strong>entrar</strong> nesta área. O mesmo horário pode valer
                            para várias áreas.
                        </p>
                        <div className="max-h-80 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-800">
                            {horarios.map((h: HorarioItem) => (
                                <label
                                    key={h.HORCodigo}
                                    className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                                >
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={vinculo.marcados.has(h.HORCodigo)}
                                        onChange={(e) => {
                                            const marcados = new Set(vinculo.marcados);
                                            if (e.target.checked) marcados.add(h.HORCodigo);
                                            else marcados.delete(h.HORCodigo);
                                            setVinculo({ ...vinculo, marcados });
                                        }}
                                    />
                                    <span className="text-sm">
                                        <span className="font-medium text-gray-800 dark:text-white/90">{h.HORNome}</span>
                                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                                            {resumirJanelas(h.janelas).join(" · ")}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button size="sm" variant="outline" onClick={() => setVinculo(null)} disabled={ocupado}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={salvarVinculos} disabled={ocupado}>
                                {ocupado ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
