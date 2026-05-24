export type TipoAglutinacaoRegistro =
    | "entrada_saida"
    | "tempo_permanencia"
    | "tempo_permanencia_periodo";

export const AGLUTINACAO_OPTIONS: { value: TipoAglutinacaoRegistro; label: string }[] = [
    { value: "entrada_saida",             label: "Entrada e saída do dia" },
    { value: "tempo_permanencia",         label: "Tempo de permanência" },
    { value: "tempo_permanencia_periodo", label: "Tempo de permanência por período" },
];

export const AGLUTINACAO_DESCRICAO: Record<TipoAglutinacaoRegistro, string> = {
    entrada_saida:
        "Registra a menor entrada e a maior saída do dia — um único intervalo por pessoa.",
    tempo_permanencia:
        "Registra cada ciclo entrada→saída como uma janela separada, capturando pausas intermediárias.",
    tempo_permanencia_periodo:
        "Agrupa as passagens dentro de períodos configurados (Manhã, Tarde, Noite…); passagens fora de todos os períodos geram uma janela extra.",
};

export interface PeriodoRegistro {
    PERCodigo?: number;
    PERNome: string;
    PERHorarioInicio: string;
    PERHorarioFim: string;
    PERToleranciaEntradaMinutos: number;
    PERToleranciaSaidaMinutos: number;
}
