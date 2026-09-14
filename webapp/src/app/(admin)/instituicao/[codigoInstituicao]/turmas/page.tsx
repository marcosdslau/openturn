"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";
import TurmaValidacaoModal, { type TurmaAlvo } from "./components/TurmaValidacaoModal";
import PerfisHorarioTab from "./components/PerfisHorarioTab";
import ImportacaoAnoAnteriorModal from "./components/ImportacaoAnoAnteriorModal";
import {
    rotuloTurma,
    selectClass,
    type OpcoesFiltro,
    type ParImportacao,
    type TurmaItem,
} from "./components/turma-tipos";

interface Meta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

type Filtros = {
    busca: string;
    ano: string;
    curso: string;
    serie: string;
    turno: string;
    perfil: string;
    equipamento: string;
    validacao: "" | "true" | "false";
    incluirForaOrigem: boolean;
};

const FILTROS_VAZIOS: Filtros = {
    busca: "",
    ano: "",
    curso: "",
    serie: "",
    turno: "",
    perfil: "",
    equipamento: "",
    validacao: "",
    incluirForaOrigem: false,
};

const OPCOES_VAZIAS: OpcoesFiltro & { equipamentos: Array<{ EQPCodigo: number; EQPDescricao: string | null }> } = {
    anos: [],
    cursos: [],
    series: [],
    turnos: [],
    perfis: [],
    equipamentos: [],
};

function montarQuery(page: number, limit: number, f: Filtros): string {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (f.busca.trim()) q.set("busca", f.busca.trim());
    for (const k of ["ano", "curso", "serie", "turno", "perfil", "equipamento"] as const) if (f[k]) q.set(k, f[k]);
    if (f.validacao) q.set("validacaoAtiva", f.validacao);
    q.set("ativa", f.incluirForaOrigem ? "todas" : "true");
    return q.toString();
}

function BadgeSync({ turma }: { turma: TurmaItem }) {
    if (!turma.TRMValidacaoAtiva || !turma.sync) return <span className="text-gray-400">—</span>;
    const s = turma.sync;
    const alvo = s.total - s.naoSuportados;
    const cor = s.erros ? "error" : s.pendentes ? "warning" : "success";
    const detalhe = [
        s.pendentes ? `${s.pendentes} pendente(s)` : null,
        s.erros ? `${s.erros} com erro` : null,
        s.naoSuportados ? `${s.naoSuportados} sem suporte` : null,
    ]
        .filter(Boolean)
        .join(", ");
    return (
        <span title={detalhe || "Todos os equipamentos em dia"}>
            <Badge size="sm" color={cor}>
                {s.sincronizados}/{alvo}
            </Badge>
        </span>
    );
}

export default function TurmasPage() {
    const params = useParams();
    const instituicaoId = String(params?.codigoInstituicao ?? "");
    const { can } = usePermissions();
    const { showToast } = useToast();
    const podeEditar = can("turma", "update");
    const podeSincronizar = can("turma", "sync");

    const [aba, setAba] = useState<"turmas" | "perfis">("turmas");
    const [turmas, setTurmas] = useState<TurmaItem[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [page, setPage] = useState(1);
    const [carregando, setCarregando] = useState(true);
    const [rascunho, setRascunho] = useState<Filtros>(FILTROS_VAZIOS);
    const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
    const [opcoes, setOpcoes] = useState(OPCOES_VAZIAS);
    const [selecionadas, setSelecionadas] = useState<Map<number, TurmaAlvo>>(new Map());
    const [modalTurmas, setModalTurmas] = useState<TurmaAlvo[] | null>(null);
    const [pares, setPares] = useState<ParImportacao[]>([]);
    const [importacaoAberta, setImportacaoAberta] = useState(false);
    const [reconciliando, setReconciliando] = useState(false);
    const [versao, setVersao] = useState(0);

    const carregar = useCallback(async () => {
        if (!instituicaoId) return;
        setCarregando(true);
        try {
            const r = await apiGet<{ data: TurmaItem[]; meta: Meta }>(
                `/instituicao/${instituicaoId}/turma?${montarQuery(page, 20, filtros)}`,
            );
            setTurmas(r.data ?? []);
            setMeta(r.meta);
        } catch (e: unknown) {
            showToast("error", "Erro ao carregar turmas", e instanceof Error ? e.message : String(e));
        } finally {
            setCarregando(false);
        }
    }, [instituicaoId, page, filtros, showToast]);

    const carregarApoio = useCallback(async () => {
        if (!instituicaoId) return;
        const [o, s] = await Promise.allSettled([
            apiGet<typeof OPCOES_VAZIAS>(`/instituicao/${instituicaoId}/turma/opcoes-filtro`),
            apiGet<{ pares: ParImportacao[] }>(`/instituicao/${instituicaoId}/turma/importacao-ano-anterior`),
        ]);
        if (o.status === "fulfilled") setOpcoes({ ...OPCOES_VAZIAS, ...o.value });
        if (s.status === "fulfilled") setPares(s.value.pares ?? []);
    }, [instituicaoId]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    useEffect(() => {
        carregarApoio();
    }, [carregarApoio]);

    const aposSalvar = () => {
        carregar();
        carregarApoio();
        setVersao((v) => v + 1);
    };

    const alvo = (t: TurmaItem): TurmaAlvo => ({
        TRMCodigo: t.TRMCodigo,
        rotulo: [rotuloTurma(t), t.TRMTurno, t.TRMAnoReferencia].filter(Boolean).join(" · "),
        TRMQtdePessoas: t.TRMQtdePessoas,
    });

    const alternarSelecao = (t: TurmaItem) =>
        setSelecionadas((prev) => {
            const n = new Map(prev);
            if (n.has(t.TRMCodigo)) n.delete(t.TRMCodigo);
            else n.set(t.TRMCodigo, alvo(t));
            return n;
        });

    const paginaSelecionavel = turmas.filter((t) => t.TRMAtiva);
    const todasDaPaginaMarcadas = paginaSelecionavel.length > 0 && paginaSelecionavel.every((t) => selecionadas.has(t.TRMCodigo));
    const alternarPagina = () =>
        setSelecionadas((prev) => {
            const n = new Map(prev);
            for (const t of paginaSelecionavel) {
                if (todasDaPaginaMarcadas) n.delete(t.TRMCodigo);
                else n.set(t.TRMCodigo, alvo(t));
            }
            return n;
        });

    const reconciliar = async () => {
        setReconciliando(true);
        try {
            const r = await apiPost<{ resumo: Record<string, number>; gruposPadraoAusentes: unknown[] }>(
                `/instituicao/${instituicaoId}/turma/reconciliar`,
                {},
                { timeoutMs: 10 * 60_000 },
            );
            const partes = Object.entries(r.resumo).map(([k, v]) => `${v} ${k.replace("_", " ")}`);
            showToast("success", "Reconciliação concluída", partes.join(", ") || "Nada a fazer");
            aposSalvar();
        } catch (e: unknown) {
            showToast("error", "Falha na reconciliação", e instanceof Error ? e.message : String(e));
        } finally {
            setReconciliando(false);
        }
    };

    const temFiltro = useMemo(() => JSON.stringify(filtros) !== JSON.stringify(FILTROS_VAZIOS), [filtros]);

    const campoSelect = (chave: keyof Filtros, rotulo: string, itens: Array<{ value: string; label: string }>) => (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{rotulo}</label>
            <select
                className={selectClass}
                value={String(rascunho[chave])}
                onChange={(e) => setRascunho((r) => ({ ...r, [chave]: e.target.value }))}
            >
                <option value="">Todos</option>
                {itens.map((i) => (
                    <option key={i.value} value={i.value}>
                        {i.label}
                    </option>
                ))}
            </select>
        </div>
    );

    const simples = (valores: string[]) => valores.map((v) => ({ value: v, label: v }));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Turmas</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Controle de acesso por turma: horários e equipamentos em que a regra vale.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {podeSincronizar && (
                        <Button size="sm" variant="outline" onClick={reconciliar} disabled={reconciliando}>
                            {reconciliando ? "Reconciliando…" : "Reconciliar equipamentos"}
                        </Button>
                    )}
                    {podeEditar && aba === "turmas" && (
                        <Button size="sm" disabled={selecionadas.size === 0} onClick={() => setModalTurmas([...selecionadas.values()])}>
                            Configurar horário ({selecionadas.size})
                        </Button>
                    )}
                </div>
            </div>

            {podeEditar && pares.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/30 dark:bg-warning-500/10">
                    <p className="text-sm text-warning-800 dark:text-warning-300">
                        <strong>{pares.length} turma(s)</strong> sem controle de acesso tinham configuração no ano anterior. Enquanto não
                        forem configuradas, os alunos passam sem restrição de horário.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setImportacaoAberta(true)}>
                        Revisar e importar
                    </Button>
                </div>
            )}

            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800" role="tablist">
                {(
                    [
                        ["turmas", "Turmas"],
                        ["perfis", "Perfis de horário"],
                    ] as const
                ).map(([valor, rotulo]) => (
                    <button
                        key={valor}
                        role="tab"
                        aria-selected={aba === valor}
                        onClick={() => setAba(valor)}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                            aba === valor
                                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        }`}
                    >
                        {rotulo}
                    </button>
                ))}
            </div>

            {aba === "perfis" ? (
                <PerfisHorarioTab instituicaoId={instituicaoId} podeEditar={podeEditar} versao={versao} />
            ) : (
                <>
                    <form
                        className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setFiltros(rascunho);
                            setPage(1);
                        }}
                    >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Buscar</label>
                                <input
                                    className={selectClass}
                                    placeholder="Turma, curso ou série"
                                    value={rascunho.busca}
                                    onChange={(e) => setRascunho((r) => ({ ...r, busca: e.target.value }))}
                                />
                            </div>
                            {campoSelect("ano", "Ano", simples(opcoes.anos))}
                            {campoSelect("turno", "Turno", simples(opcoes.turnos))}
                            {campoSelect("curso", "Curso", simples(opcoes.cursos))}
                            {campoSelect("serie", "Série", simples(opcoes.series))}
                            {campoSelect(
                                "perfil",
                                "Perfil de horário",
                                opcoes.perfis.map((p) => ({ value: String(p.PHACodigo), label: p.PHANome })),
                            )}
                            {campoSelect(
                                "equipamento",
                                "Vale no equipamento",
                                opcoes.equipamentos.map((e) => ({ value: String(e.EQPCodigo), label: e.EQPDescricao ?? `Equipamento ${e.EQPCodigo}` })),
                            )}
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Controle de acesso</label>
                                <select
                                    className={selectClass}
                                    value={rascunho.validacao}
                                    onChange={(e) => setRascunho((r) => ({ ...r, validacao: e.target.value as Filtros["validacao"] }))}
                                >
                                    <option value="">Todos</option>
                                    <option value="true">Ativo</option>
                                    <option value="false">Inativo</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <input
                                    type="checkbox"
                                    checked={rascunho.incluirForaOrigem}
                                    onChange={(e) => setRascunho((r) => ({ ...r, incluirForaOrigem: e.target.checked }))}
                                />
                                Mostrar turmas que saíram do ERP
                            </label>
                            <div className="flex gap-2">
                                {temFiltro && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setRascunho(FILTROS_VAZIOS);
                                            setFiltros(FILTROS_VAZIOS);
                                            setPage(1);
                                        }}
                                    >
                                        Limpar
                                    </Button>
                                )}
                                <Button size="sm" type="submit">
                                    Filtrar
                                </Button>
                            </div>
                        </div>
                    </form>

                    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-100 dark:border-gray-800">
                                    {podeEditar && (
                                        <th className="w-10 px-4 py-3">
                                            <input
                                                type="checkbox"
                                                aria-label="Selecionar turmas da página"
                                                checked={todasDaPaginaMarcadas}
                                                onChange={alternarPagina}
                                            />
                                        </th>
                                    )}
                                    {["Ano", "Curso", "Série / Turma", "Turno", "Pessoas", "Controle", "Horário", "Equipamentos", "Sync", ""].map((h) => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {carregando ? (
                                    <tr>
                                        <td colSpan={11} className="px-5 py-8 text-center text-gray-400">
                                            Carregando...
                                        </td>
                                    </tr>
                                ) : turmas.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="px-5 py-8 text-center text-gray-400">
                                            {temFiltro
                                                ? "Nenhuma turma com esses filtros."
                                                : "Nenhuma turma. O catálogo é alimentado pela rotina de turmas a partir do ERP."}
                                        </td>
                                    </tr>
                                ) : (
                                    turmas.map((t) => (
                                        <tr
                                            key={t.TRMCodigo}
                                            className={`border-b border-gray-50 transition-colors hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-white/[0.02] ${
                                                t.TRMAtiva ? "" : "opacity-60"
                                            }`}
                                        >
                                            {podeEditar && (
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Selecionar ${rotuloTurma(t)}`}
                                                        disabled={!t.TRMAtiva}
                                                        checked={selecionadas.has(t.TRMCodigo)}
                                                        onChange={() => alternarSelecao(t)}
                                                    />
                                                </td>
                                            )}
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t.TRMAnoReferencia ?? "—"}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t.TRMCurso ?? "—"}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                                                {rotuloTurma(t)}
                                                {!t.TRMAtiva && (
                                                    <span className="ml-2">
                                                        <Badge size="sm" color="light">
                                                            fora do ERP
                                                        </Badge>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t.TRMTurno ?? "—"}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t.TRMQtdePessoas}</td>
                                            <td className="px-4 py-3 text-sm">
                                                <Badge size="sm" color={t.TRMValidacaoAtiva ? "success" : "light"}>
                                                    {t.TRMValidacaoAtiva ? "Ativo" : "Inativo"}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                                {t.TRMValidacaoAtiva && t.perfil ? (
                                                    <>
                                                        <span className="font-mono text-gray-800 dark:text-white/90">{t.perfil.PHANome}</span>
                                                        {t.perfil.qtdeTurmas > 1 && (
                                                            <span className="block text-xs text-gray-500">{t.perfil.qtdeTurmas} turmas</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                                {t.TRMValidacaoAtiva
                                                    ? t.escopo.todos
                                                        ? `Todos (${t.escopo.total})`
                                                        : `${t.escopo.total} de ${opcoes.equipamentos.length || "?"}`
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <BadgeSync turma={t} />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button size="sm" variant="outline" onClick={() => setModalTurmas([alvo(t)])}>
                                                    {podeEditar ? "Configurar" : "Ver"}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        {meta.totalPages > 1 && (
                            <PaginationWithIcon key={JSON.stringify(filtros)} totalPages={meta.totalPages} initialPage={page} onPageChange={setPage} />
                        )}
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Total: {meta.total} turma(s)
                            {selecionadas.size > 0 && (
                                <>
                                    {" · "}
                                    {selecionadas.size} selecionada(s){" "}
                                    <button className="text-brand-600 hover:underline" onClick={() => setSelecionadas(new Map())}>
                                        limpar
                                    </button>
                                </>
                            )}
                        </p>
                    </div>
                </>
            )}

            {modalTurmas && (
                <TurmaValidacaoModal
                    isOpen
                    onClose={() => setModalTurmas(null)}
                    instituicaoId={instituicaoId}
                    turmas={modalTurmas}
                    podeEditar={podeEditar}
                    podeSincronizar={podeSincronizar}
                    onSaved={() => {
                        if (modalTurmas.length > 1) setSelecionadas(new Map());
                        aposSalvar();
                    }}
                />
            )}

            <ImportacaoAnoAnteriorModal
                isOpen={importacaoAberta}
                onClose={() => setImportacaoAberta(false)}
                instituicaoId={instituicaoId}
                pares={pares}
                onImportado={aposSalvar}
            />
        </div>
    );
}
