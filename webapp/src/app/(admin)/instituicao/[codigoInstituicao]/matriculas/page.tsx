"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Button from "@/components/ui/button/Button";
import PaginationWithIcon from "@/components/ui/pagination/PaginationWitIcon";

interface Matricula {
    MATCodigo: number;
    MATNumero: string;
    MATCurso: string | null;
    MATSerie: string | null;
    MATTurma: string | null;
    MATAtivo: boolean;
    pessoa: { PESNome: string };
}

interface Pessoa {
    PESCodigo: number;
    PESNome: string;
}

interface Meta { total: number; page: number; limit: number; totalPages: number; }

export default function MatriculasPage() {
    const params = useParams();
    const codigoInstituicao = params?.codigoInstituicao;
    const [matriculas, setMatriculas] = useState<Matricula[]>([]);
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 10, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Matricula | null>(null);
    const [form, setForm] = useState({ MATNumero: "", PESCodigo: 0, MATCurso: "", MATSerie: "", MATTurma: "" });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [matRes, pesRes] = await Promise.all([
                apiGet<{ data: Matricula[]; meta: Meta }>(`/matriculas?page=${page}&limit=${limit}`),
                apiGet<{ data: Pessoa[] }>("/pessoas?limit=100")
            ]);
            setMatriculas(matRes.data || []);
            setMeta(matRes.meta);
            setPessoas(pesRes.data || []);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [page, limit]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditing(null);
        setForm({ MATNumero: "", PESCodigo: pessoas[0]?.PESCodigo || 0, MATCurso: "", MATSerie: "", MATTurma: "" });
        setShowModal(true);
    };

    const openEdit = (m: Matricula) => {
        setEditing(m);
        setForm({
            MATNumero: m.MATNumero,
            PESCodigo: (m as any).PESCodigo || 0,
            MATCurso: m.MATCurso || "",
            MATSerie: m.MATSerie || "",
            MATTurma: m.MATTurma || ""
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await apiPatch(`/matriculas/${editing.MATCodigo}`, form);
            } else {
                await apiPost("/matriculas", { ...form, INSInstituicaoCodigo: parseInt(codigoInstituicao as string) });
            }
            setShowModal(false);
            load();
        } catch { /* ignore */ } finally { setSaving(false); }
    };

    const handleDelete = async (codigo: number) => {
        if (!confirm("Deseja realmente excluir esta matrícula?")) return;
        await apiDelete(`/matriculas/${codigo}`);
        load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Matrículas</h2>
                <Button size="sm" onClick={openNew}>+ Nova Matrícula</Button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Pessoa</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Número</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Curso/Série</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Turma</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Status</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Carregando...</td></tr>
                        ) : matriculas.length === 0 ? (
                            <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Nenhuma matrícula encontrada.</td></tr>
                        ) : matriculas.map((m) => (
                            <tr key={m.MATCodigo} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{m.pessoa?.PESNome || "—"}</td>
                                <td className="px-5 py-3 text-sm text-gray-800 dark:text-white/90">{m.MATNumero}</td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">
                                    {m.MATCurso} {m.MATSerie ? `- ${m.MATSerie}` : ""}
                                </td>
                                <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">{m.MATTurma || "—"}</td>
                                <td className="px-5 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${m.MATAtivo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                        }`}>{m.MATAtivo ? "Ativo" : "Inativo"}</span>
                                </td>
                                <td className="px-5 py-3 flex gap-2">
                                    <button onClick={() => openEdit(m)} className="text-xs text-brand-500 hover:underline">Editar</button>
                                    <button onClick={() => handleDelete(m.MATCodigo)} className="text-xs text-red-500 hover:underline">Excluir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Registros por página:</span>
                    <select
                        value={limit}
                        onChange={(e) => {
                            setLimit(Number(e.target.value));
                            setPage(1);
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>

                {meta.totalPages > 1 && (
                    <PaginationWithIcon
                        totalPages={meta.totalPages}
                        initialPage={page}
                        onPageChange={(p) => setPage(p)}
                    />
                )}

                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Total: {meta.total} registros
                </p>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-900 space-y-4">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                            {editing ? "Editar Matrícula" : "Nova Matrícula"}
                        </h3>
                        <div className="space-y-3">
                            <select value={form.PESCodigo} onChange={(e) => setForm({ ...form, PESCodigo: parseInt(e.target.value) })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                                <option value={0}>Selecione uma Pessoa</option>
                                {pessoas.map(p => <option key={p.PESCodigo} value={p.PESCodigo}>{p.PESNome}</option>)}
                            </select>
                            <input placeholder="Número da Matrícula *" value={form.MATNumero} onChange={(e) => setForm({ ...form, MATNumero: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Curso" value={form.MATCurso} onChange={(e) => setForm({ ...form, MATCurso: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Série" value={form.MATSerie} onChange={(e) => setForm({ ...form, MATSerie: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                            <input placeholder="Turma" value={form.MATTurma} onChange={(e) => setForm({ ...form, MATTurma: e.target.value })}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
                            <Button size="sm" onClick={handleSave} disabled={saving || !form.MATNumero || !form.PESCodigo}>
                                {saving ? "Salvando..." : "Salvar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
