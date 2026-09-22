"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import { useToast } from "@/context/ToastContext";
import { apiPost } from "@/lib/api";
import { rotuloOrigemHost, type ComparacaoHosts, type HostAcesso } from "./acesso-tipos";

interface Props {
    institutionId: number;
    equipmentId: number;
    hosts: HostAcesso[];
}

const COR: Record<ComparacaoHosts["veredicto"], "success" | "warning" | "error" | "info"> = {
    host_unico: "success",
    iguais: "success",
    diferentes: "error",
    indisponivel: "warning",
};

const TITULO: Record<ComparacaoHosts["veredicto"], string> = {
    host_unico: "Um host só",
    iguais: "Mesmo banco de objetos",
    diferentes: "Bancos de objetos separados",
    indisponivel: "Não foi possível concluir",
};

/**
 * Diz com qual host esta configuração está falando.
 *
 * A precedência é `EQPConfig.host` → `ip_entry` → `ip_exit` → `EQPEnderecoIp`: o IP do cadastro é o
 * ÚLTIMO fallback, então "principal" no cadastro não quer dizer "o que o sistema usa". Sem isto na
 * tela, não há como saber se áreas, portais e horários estão sendo lidos da catraca ou de um facial.
 */
export default function HostAcessoBanner({ institutionId, equipmentId, hosts }: Props) {
    const { showToast } = useToast();
    const [comparacao, setComparacao] = useState<ComparacaoHosts | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const efetivo = hosts.find((h) => h.efetivo);
    const outros = hosts.filter((h) => !h.efetivo);

    const comparar = async () => {
        setOcupado(true);
        try {
            setComparacao(
                await apiPost<ComparacaoHosts>(
                    `/instituicao/${institutionId}/equipamento/${equipmentId}/acesso/comparar-hosts`,
                    {},
                    { timeoutMs: 5 * 60_000 },
                ),
            );
        } catch (e) {
            showToast("error", "Não foi possível comparar os hosts", e instanceof Error ? e.message : String(e));
        } finally {
            setOcupado(false);
        }
    };

    if (!hosts.length) return null;

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Configurando </span>
                    <span className="font-mono font-medium text-gray-800 dark:text-white/90">
                        {efetivo?.host ?? "—"}
                    </span>
                    {efetivo && (
                        <span className="text-gray-500 dark:text-gray-400"> ({rotuloOrigemHost(efetivo.origem)})</span>
                    )}
                    {outros.length > 0 && (
                        <span className="block text-xs text-gray-400">
                            Outro(s) host(s) neste equipamento:{" "}
                            {outros.map((h) => `${h.host} (${rotuloOrigemHost(h.origem)})`).join(", ")} — não recebem esta
                            configuração.
                        </span>
                    )}
                </div>
                {outros.length > 0 && (
                    <Button size="sm" variant="outline" onClick={comparar} disabled={ocupado}>
                        {ocupado ? "Comparando..." : "Comparar hosts"}
                    </Button>
                )}
            </div>

            <Modal isOpen={!!comparacao} onClose={() => setComparacao(null)} className="w-full max-w-2xl rounded-2xl p-6">
                {comparacao && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                                {TITULO[comparacao.veredicto]}
                            </h4>
                            <Badge size="sm" color={COR[comparacao.veredicto]}>
                                {comparacao.veredicto}
                            </Badge>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 dark:border-gray-800">
                                        {["Host", "Origem", "Áreas", "Portais", "Horários", "Deptos", "Regras"].map((h) => (
                                            <th
                                                key={h}
                                                className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {comparacao.hosts.map((h) => (
                                        <tr key={h.host} className="border-b border-gray-50 last:border-0 dark:border-gray-800/50">
                                            <td className="px-3 py-2 font-mono">
                                                {h.host}
                                                {h.efetivo && (
                                                    <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                                                        em uso
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                                                {rotuloOrigemHost(h.origem)}
                                            </td>
                                            {h.erro ? (
                                                <td colSpan={5} className="px-3 py-2 text-error-600">
                                                    {h.erro}
                                                </td>
                                            ) : (
                                                <>
                                                    <td className="px-3 py-2">{h.contagens?.areas ?? "—"}</td>
                                                    <td className="px-3 py-2">{h.contagens?.portais ?? "—"}</td>
                                                    <td className="px-3 py-2">{h.contagens?.horarios ?? "—"}</td>
                                                    <td className="px-3 py-2">{h.contagens?.grupos ?? "—"}</td>
                                                    <td className="px-3 py-2">{h.contagens?.regras ?? "—"}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {comparacao.diferencas.length > 0 && (
                            <div className="max-h-60 overflow-y-auto rounded-xl bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
                                <ul className="list-inside list-disc space-y-1">
                                    {comparacao.diferencas.map((d) => (
                                        <li key={d}>{d}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
                            {comparacao.recomendacao}
                        </p>

                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => setComparacao(null)}>
                                Fechar
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
