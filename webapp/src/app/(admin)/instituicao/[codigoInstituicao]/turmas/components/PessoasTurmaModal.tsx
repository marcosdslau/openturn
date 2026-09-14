"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { apiGet } from "@/lib/api";
import PessoaFotoListagem from "../../pessoas/components/PessoaFotoListagem";
import { timeInputClass, type PessoasDaTurmaResposta } from "./turma-tipos";
import type { TurmaAlvo } from "./TurmaValidacaoModal";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    instituicaoId: string;
    turma: TurmaAlvo;
}

const POR_PAGINA = 50;

/** Pessoas vinculadas à turma (matrícula ativa no catálogo), com atalho para o cadastro em nova aba. */
export default function PessoasTurmaModal({ isOpen, onClose, instituicaoId, turma }: Props) {
    const [busca, setBusca] = useState("");
    const [buscaAplicada, setBuscaAplicada] = useState("");
    const [page, setPage] = useState(1);
    const [resposta, setResposta] = useState<PessoasDaTurmaResposta | null>(null);
    /** Chave (página + busca) da última resposta recebida; diferente da atual = carregando. */
    const [chaveCarregada, setChaveCarregada] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const seq = useRef(0);

    // Busca ao digitar, com espera curta para não disparar uma consulta por tecla.
    useEffect(() => {
        const t = setTimeout(() => {
            setBuscaAplicada(busca.trim());
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [busca]);

    useEffect(() => {
        if (!isOpen) return;
        const atual = ++seq.current;
        const chave = `${page}|${buscaAplicada}`;
        const q = new URLSearchParams({ page: String(page), limit: String(POR_PAGINA) });
        if (buscaAplicada) q.set("busca", buscaAplicada);
        apiGet<PessoasDaTurmaResposta>(`/instituicao/${instituicaoId}/turma/${turma.TRMCodigo}/pessoas?${q}`)
            .then((r) => {
                if (atual !== seq.current) return;
                setResposta(r);
                setErro(null);
                setChaveCarregada(chave);
            })
            .catch((e: Error) => {
                if (atual !== seq.current) return;
                setResposta(null);
                setErro(e.message);
                setChaveCarregada(chave);
            });
    }, [isOpen, instituicaoId, turma.TRMCodigo, page, buscaAplicada]);

    const carregando = chaveCarregada !== `${page}|${buscaAplicada}`;
    const meta = resposta?.meta;
    const inicio = meta && meta.total ? (meta.page - 1) * meta.limit + 1 : 0;
    const fim = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-2xl overflow-hidden rounded-2xl">
            <div className="flex max-h-[90vh] flex-col">
                <div className="flex min-h-[5.5rem] shrink-0 items-center border-b border-gray-100 py-4 pl-6 pr-16 sm:pr-24 dark:border-gray-800">
                    <div className="min-w-0">
                        <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">Pessoas da turma</h4>
                        <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                            {[resposta?.turma.rotulo ?? turma.rotulo, resposta?.turma.TRMCurso].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                </div>

                <div className="shrink-0 px-6 pt-4">
                    <input
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar por nome ou matrícula"
                        aria-label="Buscar pessoa"
                        className={timeInputClass}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    {erro ? (
                        <p className="rounded-xl bg-error-50 p-4 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
                            Não foi possível carregar as pessoas: {erro}
                        </p>
                    ) : !resposta ? (
                        <p className="py-10 text-center text-sm text-gray-400">Carregando…</p>
                    ) : resposta.data.length === 0 ? (
                        <p className="py-10 text-center text-sm text-gray-400">
                            {buscaAplicada ? `Nenhuma pessoa da turma com “${buscaAplicada}”.` : "Nenhuma pessoa vinculada a esta turma."}
                        </p>
                    ) : (
                        <ul className={`divide-y divide-gray-100 dark:divide-gray-800 ${carregando ? "opacity-60" : ""}`} aria-busy={carregando}>
                            {resposta.data.map((p) => (
                                <li key={p.PESCodigo} className="flex items-center gap-3 py-2.5">
                                    <PessoaFotoListagem
                                        nome={p.PESNome}
                                        fotoBase64={p.PESFotoBase64}
                                        fotoExtensao={p.PESFotoExtensao}
                                        imageError={p.PESImageError}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{p.PESNome}</p>
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                            {p.PESNomeSocial && <span>Nome social: {p.PESNomeSocial}</span>}
                                            {p.matriculas.length > 0 && <span>Matrícula {p.matriculas.join(", ")}</span>}
                                            {!p.PESAtivo && (
                                                <Badge size="sm" color="light">
                                                    Inativa
                                                </Badge>
                                            )}
                                            {p.turmaDeAcesso && !p.turmaDeAcesso.estaTurma && (
                                                <span title="A pessoa está em mais de uma turma; o acesso segue a turma de maior prioridade">
                                                    <Badge size="sm" color="warning">
                                                        Acesso pela turma {p.turmaDeAcesso.rotulo}
                                                    </Badge>
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <a
                                        href={`/instituicao/${instituicaoId}/pessoas/${p.PESCodigo}/edit`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`Abrir cadastro de ${p.PESNome} em nova aba`}
                                        aria-label={`Abrir cadastro de ${p.PESNome} em nova aba`}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 ring-1 ring-inset ring-gray-200 transition-colors hover:bg-gray-50 hover:text-brand-600 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/5 dark:hover:text-brand-400"
                                    >
                                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                                            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-3 dark:border-gray-800">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {meta ? (meta.total ? `${inicio}–${fim} de ${meta.total} pessoa(s)` : "0 pessoa(s)") : " "}
                    </p>
                    {meta && meta.totalPages > 1 && (
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" disabled={carregando || meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
                                Anterior
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={carregando || meta.page >= meta.totalPages}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                Próxima
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
