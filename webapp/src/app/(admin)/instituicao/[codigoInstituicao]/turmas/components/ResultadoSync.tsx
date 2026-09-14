"use client";

import Badge from "@/components/ui/badge/Badge";
import { STATUS_EQUIPAMENTO, type ResultadoEquipamento } from "./turma-tipos";

/** Resultado por equipamento devolvido após salvar/sincronizar. */
export default function ResultadoSync({ resultados }: { resultados: ResultadoEquipamento[] }) {
    if (!resultados.length) {
        return <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum equipamento precisou ser alterado.</p>;
    }
    return (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {resultados.map((r) => {
                const s = STATUS_EQUIPAMENTO[r.status] ?? { rotulo: r.status, cor: "light" as const };
                return (
                    <li key={`${r.EQPCodigo}-${r.PHACodigo}`} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                                {r.EQPDescricao ?? `Equipamento ${r.EQPCodigo}`}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Perfil {r.PHANome}
                                {r.mensagem ? ` — ${r.mensagem}` : ""}
                            </p>
                        </div>
                        <Badge size="sm" color={s.cor}>
                            {s.rotulo}
                        </Badge>
                    </li>
                );
            })}
        </ul>
    );
}
