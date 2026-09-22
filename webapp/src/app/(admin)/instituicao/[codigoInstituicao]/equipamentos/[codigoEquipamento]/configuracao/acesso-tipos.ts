/** Tipos do espelho da configuração de acesso do equipamento, como a API devolve. */

export interface AreaItem {
    ARECodigo: number;
    AREIdDevice: string;
    ARENome: string;
}

export interface PortalItem {
    PTLCodigo: number;
    PTLIdDevice: string;
    PTLNome: string;
    PTLAreaDeCodigo: number | null;
    PTLAreaParaCodigo: number | null;
}

export interface JanelaItem {
    HRJCodigo: number;
    /** Segundos desde 00:00 — o firmware usa 86399 como fim do dia. */
    inicioSeg: number;
    fimSeg: number;
    /** dom..sab */
    dias: boolean[];
    /** hol1..hol3 */
    feriados: boolean[];
}

export interface HorarioItem {
    HORCodigo: number;
    HORIdDevice: string;
    HORNome: string;
    /** Áreas cuja ENTRADA este horário libera. */
    areas: number[];
    janelas: JanelaItem[];
}

export interface DepartamentoItem {
    DEQCodigo: number;
    DEQIdDevice: string;
    DEQNome: string;
    DEPCodigo: number;
    DEPNome: string;
    revisadoEm: string | null;
    verificadoEm: string | null;
    ultimoErro: string | null;
    regras: Array<{ DRGCodigo: number; HORCodigo: number; idRegraDevice: string | null; areas: number[] }>;
}

export interface HostAcesso {
    host: string;
    /** Campo de onde o host saiu, ex.: "EQPConfig.ip_entry". */
    origem: string;
    /** true = é com este que o sistema fala. */
    efetivo: boolean;
}

export interface ResumoHost extends HostAcesso {
    erro?: string;
    contagens?: { areas: number; portais: number; horarios: number; grupos: number; regras: number };
}

export interface ComparacaoHosts {
    hosts: ResumoHost[];
    veredicto: "host_unico" | "iguais" | "diferentes" | "indisponivel";
    diferencas: string[];
    recomendacao: string;
}

export interface EspelhoAcesso {
    EQPCodigo: number;
    EQPDescricao: string | null;
    /** Hosts do equipamento; o espelho representa o marcado como `efetivo`. */
    hosts: HostAcesso[];
    areas: AreaItem[];
    portais: PortalItem[];
    horarios: HorarioItem[];
    departamentos: DepartamentoItem[];
}

/** Toda escrita devolve o espelho já reconciliado com o equipamento. */
export interface RespostaComEspelho {
    espelho: EspelhoAcesso;
}

export interface ResumoLeitura {
    areas: { criadas: number; atualizadas: number; removidas: number };
    portais: { criados: number; atualizados: number; removidos: number };
    horarios: { criados: number; atualizados: number; removidos: number; janelas: number };
    vinculosSemeados: number;
    departamentos: { adotados: number; regras: number };
    gruposNaoAdotados: Array<{ id: string; nome: string }>;
    observacoes: {
        bloqueios: number;
        regrasSemHorario: number;
        regrasDuplicadas: number;
        leituraVazia: boolean;
    };
}

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** 23400 → "06:30". 86399 (fim do dia do firmware) vira "24:00". */
export function hhmmDeSegundos(seg: number): string {
    if (seg >= 86399) return "24:00";
    const min = Math.round(seg / 60);
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "Seg–Sex 06:30–07:30" a partir das janelas do espelho. */
export function resumirJanelas(janelas: JanelaItem[]): string[] {
    if (!janelas.length) return ["Sem faixas"];
    return janelas.map((j) => {
        const dias = j.dias
            .map((ativo, i) => (ativo ? DIAS_CURTOS[i] : null))
            .filter(Boolean)
            .join(", ");
        return `${dias || "nenhum dia"} ${hhmmDeSegundos(j.inicioSeg)}–${hhmmDeSegundos(j.fimSeg)}`;
    });
}

/** Portal que leva PARA esta área — é ele que libera a entrada nela. */
export function portalDeEntrada(portais: PortalItem[], ARECodigo: number): PortalItem | undefined {
    return portais.find((p) => p.PTLAreaParaCodigo === ARECodigo);
}

/** "EQPConfig.ip_entry" → "facial de entrada", para a tela não falar em nome de coluna. */
export function rotuloOrigemHost(origem: string): string {
    switch (origem) {
        case "EQPConfig.host":
            return "host da configuração";
        case "EQPConfig.ip_entry":
            return "facial de entrada";
        case "EQPConfig.ip_exit":
            return "facial de saída";
        case "EQPEnderecoIp":
            return "IP do cadastro";
        default:
            return origem;
    }
}

/** [inicio, fim) em minutos desde 00:00. */
export type Intervalo = [number, number];
/** 7 posições (dom..sab), cada uma com intervalos ordenados e fundidos. */
export type PorDia = Intervalo[][];

function ordenarEFundir(intervalos: Intervalo[]): Intervalo[] {
    const ordenados = [...intervalos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const saida: Intervalo[] = [];
    for (const [ini, fim] of ordenados) {
        const ultimo = saida[saida.length - 1];
        if (ultimo && ini <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fim);
        else saida.push([ini, fim]);
    }
    return saida;
}

/** Minutos que um horário libera em cada dia. 86399 do firmware vira 1440 (fim do dia). */
export function diasDoHorario(horario: HorarioItem): PorDia {
    const dias: Intervalo[][] = [[], [], [], [], [], [], []];
    for (const j of horario.janelas) {
        const ini = Math.floor(j.inicioSeg / 60);
        const fim = j.fimSeg >= 86399 ? 1440 : Math.round(j.fimSeg / 60);
        if (fim <= ini) continue;
        j.dias.forEach((ativo, d) => {
            if (ativo) dias[d].push([ini, fim]);
        });
    }
    return dias.map(ordenarEFundir);
}

/**
 * O que o departamento libera em cada área: união dos horários das regras que incluem a área.
 * É a mesma conta que o equipamento faz — permissões somam (runbook §6.4).
 */
export function liberadoPorArea(
    departamento: DepartamentoItem,
    horarios: HorarioItem[],
): Map<number, PorDia> {
    const porCodigo = new Map(horarios.map((h) => [h.HORCodigo, h]));
    const mapa = new Map<number, Intervalo[][]>();
    for (const regra of departamento.regras) {
        const horario = porCodigo.get(regra.HORCodigo);
        if (!horario) continue;
        const dias = diasDoHorario(horario);
        for (const are of regra.areas) {
            const atual = mapa.get(are) ?? [[], [], [], [], [], [], []];
            dias.forEach((intervalos, d) => atual[d].push(...intervalos));
            mapa.set(are, atual);
        }
    }
    return new Map([...mapa].map(([are, dias]) => [are, dias.map(ordenarEFundir)]));
}

/** Paleta por área, ciclando. Cor fixa por posição para a grade e os chips combinarem. */
export const CORES_AREA = [
    { barra: "bg-brand-500", chip: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300", borda: "border-brand-500/70" },
    { barra: "bg-orange-500", chip: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", borda: "border-orange-500/70" },
    { barra: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", borda: "border-emerald-500/70" },
    { barra: "bg-purple-500", chip: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300", borda: "border-purple-500/70" },
    { barra: "bg-cyan-500", chip: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", borda: "border-cyan-500/70" },
    { barra: "bg-pink-500", chip: "bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300", borda: "border-pink-500/70" },
] as const;

export const corDaArea = (indice: number) => CORES_AREA[indice % CORES_AREA.length];

/** Forma da regra encontrada no equipamento, do ponto de vista do modelo. */
export type FormaRegra = "nossa" | "multiplos_horarios" | "compartilhada" | "sem_horario";

export const AVISO_FORMA: Record<FormaRegra, string | null> = {
    nossa: null,
    multiplos_horarios: "tem mais de um horário — ao editar, será substituída por regras separadas",
    compartilhada: "também serve a outro departamento — ao editar, será substituída",
    sem_horario: "sem horário: o equipamento trata como sempre liberada",
};

export interface CandidatoDepartamento {
    DEQIdDevice: string;
    nome: string;
    regras: Array<{
        idRegra: string;
        nomeRegra: string;
        horarios: Array<{ HORCodigo: number | null; idDevice: string; nome: string }>;
        areas: Array<{ ARECodigo: number | null; nome: string }>;
        forma: FormaRegra;
    }>;
    DEPSugerido: { DEPCodigo: number; DEPNome: string } | null;
    sugestaoOcupada: boolean;
}

export interface RespostaCandidatos {
    candidatos: CandidatoDepartamento[];
    departamentos: Array<{ DEPCodigo: number; DEPNome: string; adotadoAqui: boolean }>;
}

/**
 * Departamentos adotados que não têm nenhuma regra liberando a entrada nesta área.
 *
 * Um portal sem regra não deixa ninguém passar. No fluxo antigo o preparo de áreas replicava as
 * regras gerais nos portais novos; o modelo novo não replica nada em silêncio — ele mostra quem
 * ficou de fora. Entrar e ficar preso do lado de dentro é o modo de falha que originou tudo isto.
 */
export function departamentosSemRegraNaArea(
    departamentos: DepartamentoItem[],
    ARECodigo: number,
): DepartamentoItem[] {
    return departamentos.filter((d) => !d.regras.some((r) => r.areas.includes(ARECodigo)));
}
