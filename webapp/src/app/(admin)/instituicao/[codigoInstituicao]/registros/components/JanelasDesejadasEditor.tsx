"use client";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface Janela {
    horaEntrada: string;
    horaSaida: string;
}

interface Props {
    janelas: Janela[];
    onChange: (janelas: Janela[]) => void;
    maxJanelas?: number;
}

export default function JanelasDesejadasEditor({ janelas, onChange, maxJanelas = 20 }: Props) {
    const add = () => {
        if (janelas.length >= maxJanelas) return;
        onChange([...janelas, { horaEntrada: "", horaSaida: "" }]);
    };

    const remove = (idx: number) => onChange(janelas.filter((_, i) => i !== idx));

    const update = (idx: number, field: keyof Janela, value: string) => {
        onChange(janelas.map((j, i) => (i === idx ? { ...j, [field]: value } : j)));
    };

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                            <th className="w-10 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">#</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Hora entrada</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Hora saída</th>
                            <th className="w-10 px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {janelas.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-400">
                                    Nenhuma janela adicionada.
                                </td>
                            </tr>
                        ) : (
                            janelas.map((j, idx) => {
                                const entradaInvalida = j.horaEntrada !== "" && !HHMM.test(j.horaEntrada);
                                const saidaInvalida = j.horaSaida !== "" && !HHMM.test(j.horaSaida);
                                return (
                                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                                        <td className="px-3 py-2 text-xs text-gray-400">{idx + 1}</td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                placeholder="07:00"
                                                maxLength={5}
                                                value={j.horaEntrada}
                                                onChange={(e) => update(idx, "horaEntrada", e.target.value)}
                                                className={`w-24 rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 dark:bg-gray-800 dark:text-white ${
                                                    entradaInvalida
                                                        ? "border-red-400 focus:ring-red-400/30"
                                                        : "border-gray-300 focus:ring-brand-500/30 dark:border-gray-600"
                                                }`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                placeholder="17:30"
                                                maxLength={5}
                                                value={j.horaSaida}
                                                onChange={(e) => update(idx, "horaSaida", e.target.value)}
                                                className={`w-24 rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 dark:bg-gray-800 dark:text-white ${
                                                    saidaInvalida
                                                        ? "border-red-400 focus:ring-red-400/30"
                                                        : "border-gray-300 focus:ring-brand-500/30 dark:border-gray-600"
                                                }`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => remove(idx)}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                                title="Remover janela"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {janelas.length < maxJanelas && (
                <button
                    type="button"
                    onClick={add}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Adicionar janela
                </button>
            )}
        </div>
    );
}
