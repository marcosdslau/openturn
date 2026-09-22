"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Checkbox from "@/components/form/input/Checkbox";
import { useToast } from "@/context/ToastContext";
import { apiPost } from "@/lib/api";
import ResultadoSync from "./ResultadoSync";
import { SENTIDOS, SENTIDO_INFO, resumirRegra, type ParImportacao, type ResultadoEquipamento } from "./turma-tipos";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    instituicaoId: string;
    pares: ParImportacao[];
    onImportado: () => void;
}

/** Virada do ano letivo (§13.5): sugestão por curso+série+turma+turno; nada é herdado sem confirmação. */
export default function ImportacaoAnoAnteriorModal({ isOpen, onClose, instituicaoId, pares, onImportado }: Props) {
    const { showToast } = useToast();
    const [marcados, setMarcados] = useState<Set<number>>(new Set());
    const [importando, setImportando] = useState(false);
    const [resultado, setResultado] = useState<{
        importadas: number;
        falhas: Array<{ TRMCodigoDestino: number; erro: string }>;
        resultados: ResultadoEquipamento[];
    } | null>(null);

    useEffect(() => {
        if (isOpen) {
            setMarcados(new Set(pares.map((p) => p.destino.TRMCodigo)));
            setResultado(null);
        }
    }, [isOpen, pares]);

    const importar = async () => {
        setImportando(true);
        try {
            const selecionados = pares.filter((p) => marcados.has(p.destino.TRMCodigo));
            const r = await apiPost<NonNullable<typeof resultado>>(`/instituicao/${instituicaoId}/turma/importacao-ano-anterior`, {
                pares: selecionados.map((p) => ({ TRMCodigoOrigem: p.origem.TRMCodigo, TRMCodigoDestino: p.destino.TRMCodigo })),
            });
            setResultado(r);
            showToast(r.falhas.length ? "warning" : "success", `${r.importadas} turma(s) configurada(s)`, r.falhas.length ? `${r.falhas.length} falha(s)` : undefined);
            onImportado();
        } catch (e: unknown) {
            showToast("error", "Falha ao importar", e instanceof Error ? e.message : String(e));
        } finally {
            setImportando(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-3xl rounded-2xl p-6">
            <div className="max-h-[85vh] space-y-4 overflow-y-auto pr-1">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">Importar configuração do ano anterior</h4>

                {resultado ? (
                    <>
                        {resultado.falhas.length > 0 && (
                            <ul className="space-y-1 rounded-xl bg-error-50 p-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
                                {resultado.falhas.map((f) => (
                                    <li key={f.TRMCodigoDestino}>
                                        {pares.find((p) => p.destino.TRMCodigo === f.TRMCodigoDestino)?.destino.rotulo ?? f.TRMCodigoDestino}: {f.erro}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <ResultadoSync resultados={resultado.resultados} />
                        <div className="flex justify-end">
                            <Button size="sm" onClick={onClose}>
                                Fechar
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Correspondências sugeridas por curso, série, turma e turno. Horários costumam mudar de um ano para outro —
                            desmarque o que não deve ser copiado.
                        </p>
                        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                            {pares.map((p) => (
                                <li key={p.destino.TRMCodigo} className="flex items-start gap-3 px-3 py-3">
                                    <Checkbox
                                        id={`par-${p.destino.TRMCodigo}`}
                                        checked={marcados.has(p.destino.TRMCodigo)}
                                        onChange={(v) =>
                                            setMarcados((prev) => {
                                                const n = new Set(prev);
                                                if (v) n.add(p.destino.TRMCodigo);
                                                else n.delete(p.destino.TRMCodigo);
                                                return n;
                                            })
                                        }
                                    />
                                    <div className="min-w-0 text-sm">
                                        <p className="font-medium text-gray-800 dark:text-white/90">
                                            {p.destino.rotulo} <span className="font-normal text-gray-500">← {p.origem.rotulo}</span>
                                        </p>
                                        <p className="font-mono text-xs text-gray-500">{p.origem.PHANome}</p>
                                        {SENTIDOS.map((s) => (
                                            <p key={s} className="text-gray-600 dark:text-gray-400">
                                                {SENTIDO_INFO[s].titulo}: {resumirRegra(p.origem.regras[s])}
                                            </p>
                                        ))}
                                        <p className="text-xs text-gray-500">
                                            {p.origem.escopo.todos
                                                ? "Todos os equipamentos"
                                                : `${p.origem.escopo.EQPCodigos?.length ?? 0} equipamento(s) selecionado(s)`}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-end gap-3">
                            <Button size="sm" variant="outline" onClick={onClose} disabled={importando}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={importar} disabled={importando || marcados.size === 0}>
                                {importando ? "Importando…" : `Importar ${marcados.size} turma(s)`}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
