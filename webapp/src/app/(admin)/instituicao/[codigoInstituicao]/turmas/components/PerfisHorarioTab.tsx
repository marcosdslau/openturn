"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useToast } from "@/context/ToastContext";
import { apiGet, apiPut } from "@/lib/api";
import ResultadoSync from "./ResultadoSync";
import {
    PERFIL_NOME_MAX_BYTES,
    bytesUtf8,
    resumirFaixas,
    type PerfilItem,
    type ResultadoEquipamento,
} from "./turma-tipos";

interface Props {
    instituicaoId: string;
    podeEditar: boolean;
    /** Muda quando a aba Turmas salva algo, para recarregar. */
    versao: number;
}

/** Aba "Perfis de horário" (§13.4): perfil = departamento no equipamento. Horário não é editável aqui por design (§6.4). */
export default function PerfisHorarioTab({ instituicaoId, podeEditar, versao }: Props) {
    const { showToast } = useToast();
    const [perfis, setPerfis] = useState<PerfilItem[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [editando, setEditando] = useState<PerfilItem | null>(null);
    const [nome, setNome] = useState("");
    const [salvando, setSalvando] = useState(false);
    const [resultados, setResultados] = useState<ResultadoEquipamento[] | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setPerfis(await apiGet<PerfilItem[]>(`/instituicao/${instituicaoId}/turma/perfil`));
        } catch (e: unknown) {
            showToast("error", "Erro ao carregar perfis", e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, [instituicaoId, showToast]);

    useEffect(() => {
        carregar();
    }, [carregar, versao]);

    const abrir = (p: PerfilItem) => {
        setEditando(p);
        setNome(p.PHANome);
        setResultados(null);
    };

    const bytes = bytesUtf8(nome.trim());
    const nomeInvalido = !nome.trim() || bytes > PERFIL_NOME_MAX_BYTES;

    const renomear = async () => {
        if (!editando) return;
        setSalvando(true);
        try {
            const r = await apiPut<{ PHANome: string; resultados: ResultadoEquipamento[] }>(
                `/instituicao/${instituicaoId}/turma/perfil/${editando.PHACodigo}`,
                { nome: nome.trim() },
            );
            setResultados(r.resultados);
            showToast("success", "Perfil renomeado", r.PHANome);
            carregar();
        } catch (e: unknown) {
            showToast("error", "Não foi possível renomear", e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            {["Perfil", "Horário", "Turmas", "Equipamentos", ""].map((h) => (
                                <th key={h} className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {carregando ? (
                            <tr>
                                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                                    Carregando...
                                </td>
                            </tr>
                        ) : perfis.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                                    Nenhum perfil ainda. Perfis são criados ao ativar o controle de acesso de uma turma.
                                </td>
                            </tr>
                        ) : (
                            perfis.map((p) => (
                                <tr key={p.PHACodigo} className="border-b border-gray-50 align-top dark:border-gray-800/50">
                                    <td className="px-5 py-3">
                                        <span className="font-mono text-sm font-medium text-gray-800 dark:text-white/90">{p.PHANome}</span>
                                    </td>
                                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{resumirFaixas(p.horarios)}</td>
                                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {p.emUso ? p.turmas.map((t) => t.rotulo).join("; ") : <span className="text-gray-400">— sem uso</span>}
                                    </td>
                                    <td className="px-5 py-3 text-sm">
                                        <div className="flex flex-wrap gap-1.5">
                                            {p.equipamentos.total > 0 && (
                                                <Badge
                                                    size="sm"
                                                    color={
                                                        p.equipamentos.erros
                                                            ? "error"
                                                            : p.equipamentos.pendentes
                                                              ? "warning"
                                                              : "success"
                                                    }
                                                >
                                                    {p.equipamentos.sincronizados}/{p.equipamentos.total - p.equipamentos.naoSuportados} em dia
                                                </Badge>
                                            )}
                                            {p.removendo.length > 0 && (
                                                <span title={p.removendo.map((r) => `${r.EQPDescricao ?? r.EQPCodigo}: ${r.mensagem ?? "pendente"}`).join("\n")}>
                                                    <Badge size="sm" color="warning">
                                                        removendo de {p.removendo.length}
                                                    </Badge>
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                        {podeEditar && (
                                            <Button size="sm" variant="outline" onClick={() => abrir(p)}>
                                                Renomear
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={!!editando} onClose={() => setEditando(null)} className="w-full max-w-md rounded-2xl p-6">
                {editando && (
                    <div className="space-y-4">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">Renomear perfil {editando.PHANome}</h4>
                        {resultados ? (
                            <>
                                <ResultadoSync resultados={resultados} />
                                <div className="flex justify-end">
                                    <Button size="sm" onClick={() => setEditando(null)}>
                                        Fechar
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <Label htmlFor="perfil-nome">Nome no equipamento</Label>
                                    <InputField id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                                    <p className={`mt-1 text-xs ${bytes > PERFIL_NOME_MAX_BYTES ? "text-error-600" : "text-gray-500"}`}>
                                        {bytes}/{PERFIL_NOME_MAX_BYTES} — letras acentuadas contam como 2.
                                    </p>
                                </div>
                                <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                                    O departamento é renomeado nos equipamentos e todas as pessoas deste perfil são reenviadas
                                    {editando.turmas.length ? ` (${editando.turmas.length} turma(s))` : ""}, inclusive a foto. Evite
                                    renomear em horário de entrada.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <Button size="sm" variant="outline" onClick={() => setEditando(null)} disabled={salvando}>
                                        Cancelar
                                    </Button>
                                    <Button size="sm" onClick={renomear} disabled={salvando || nomeInvalido || nome.trim() === editando.PHANome}>
                                        {salvando ? "Renomeando…" : "Renomear"}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
