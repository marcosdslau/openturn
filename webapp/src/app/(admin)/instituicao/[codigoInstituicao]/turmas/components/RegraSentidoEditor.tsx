"use client";

import FaixasHorarioEditor from "./FaixasHorarioEditor";
import { COR_SENTIDO } from "./DiagramaRegraTurma";
import { MODO_INFO, SENTIDO_INFO, faixaPadrao, type ModoSentido, type RegraSentido, type Sentido } from "./turma-tipos";

interface Props {
    sentido: Sentido;
    regra: RegraSentido;
    onChange: (regra: RegraSentido) => void;
    disabled?: boolean;
}

const MODOS: ModoSentido[] = ["horario", "livre", "bloqueado"];

/** Regra de um sentido: sempre liberado, somente nos horários (faixas) ou bloqueado. */
export default function RegraSentidoEditor({ sentido, regra, onChange, disabled }: Props) {
    const cor = COR_SENTIDO[sentido];
    const info = SENTIDO_INFO[sentido];
    return (
        <section className={`rounded-2xl border-l-4 bg-gray-50/60 p-4 dark:bg-white/[0.02] ${cor.borda}`} data-testid={`regra-${sentido}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h5 className={`text-sm font-semibold ${cor.texto}`}>{info.titulo}</h5>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {info.fluxo} · {info.descricao}
                </span>
            </div>

            <div className="mt-3 inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 dark:bg-white/5" role="radiogroup" aria-label={info.titulo}>
                {MODOS.map((modo) => {
                    const ativo = regra.modo === modo;
                    return (
                        <button
                            key={modo}
                            type="button"
                            role="radio"
                            aria-checked={ativo}
                            disabled={disabled}
                            onClick={() =>
                                onChange({ modo, horarios: regra.horarios?.length ? regra.horarios : [faixaPadrao()] })
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                ativo
                                    ? modo === "bloqueado"
                                        ? "bg-error-500 text-white"
                                        : `${cor.barra} text-white`
                                    : "text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-white/10"
                            }`}
                        >
                            {MODO_INFO[modo].rotulo}
                        </button>
                    );
                })}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{MODO_INFO[regra.modo].descricao}</p>

            {regra.modo === "horario" && (
                <div className="mt-3">
                    <FaixasHorarioEditor
                        faixas={regra.horarios ?? []}
                        onChange={(horarios) => onChange({ ...regra, horarios })}
                        disabled={disabled}
                    />
                </div>
            )}
        </section>
    );
}
