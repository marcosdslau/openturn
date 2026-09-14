/** Tipos e utilitários da tela Turmas (controle de acesso por turma — working/Controle-turma/README.md). */

export interface Faixa {
    inicio: string;
    fim: string;
    /** dom..sab */
    dias: boolean[];
}

export interface Escopo {
    todos: boolean;
    EQPCodigos: number[];
}

export interface SyncResumo {
    total: number;
    sincronizados: number;
    pendentes: number;
    erros: number;
    naoSuportados: number;
}

export interface TurmaItem {
    TRMCodigo: number;
    TRMIdExterno: string;
    TRMTurma: string;
    TRMCurso: string | null;
    TRMSerie: string | null;
    TRMTurno: string | null;
    TRMAnoReferencia: string | null;
    TRMCalendario: string | null;
    TRMAtiva: boolean;
    TRMValidacaoAtiva: boolean;
    TRMPrioridade: number;
    TRMQtdePessoas: number;
    TRMAlteradoEm: string | null;
    perfil: { PHACodigo: number; PHANome: string; qtdeTurmas: number } | null;
    escopo: Escopo & { total: number };
    sync: SyncResumo | null;
}

export interface EquipamentoTurma {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
    EQPAtivo: boolean;
    suportado: boolean;
    selecionado: boolean;
    noEscopo: boolean;
    sync: { status: "em_dia" | "pendente" | "erro"; em: string | null; erro: string | null } | null;
}

export interface TurmaDetalhe {
    TRMCodigo: number;
    TRMTurma: string;
    TRMCurso: string | null;
    TRMSerie: string | null;
    TRMTurno: string | null;
    TRMAnoReferencia: string | null;
    TRMAtiva: boolean;
    TRMValidacaoAtiva: boolean;
    TRMQtdePessoas: number;
    rotulo: string;
    alteracao: { em: string | null; usuario: string | null; rotina: number | null };
    horarios: Faixa[];
    perfil: { PHACodigo: number; PHANome: string; outrasTurmas: string[] } | null;
    escopo: Escopo;
    equipamentos: EquipamentoTurma[];
}

export interface PreviewPerfil {
    erros: string[];
    perfilExistente: { PHACodigo: number; PHANome: string; turmas: string[] } | null;
    nomeSugerido: string | null;
    perfilAtual: { PHACodigo: number; PHANome: string; outrasTurmas: number } | null;
    mesmoPerfilAtual: boolean;
}

export type StatusEquipamento =
    | "aplicado"
    | "sem_mudanca"
    | "removido"
    | "aguardando_membros"
    | "ocupado"
    | "nao_suportado"
    | "inativo"
    | "erro";

export interface ResultadoEquipamento {
    EQPCodigo: number;
    EQPDescricao: string | null;
    PHACodigo: number;
    PHANome: string;
    status: StatusEquipamento;
    mensagem?: string;
}

export interface PerfilItem {
    PHACodigo: number;
    PHANome: string;
    horarios: Faixa[];
    turmas: Array<{ TRMCodigo: number; rotulo: string }>;
    emUso: boolean;
    equipamentos: SyncResumo;
    removendo: Array<{ EQPCodigo: number; EQPDescricao: string | null; mensagem: string | null }>;
}

export interface OpcoesFiltro {
    anos: string[];
    cursos: string[];
    series: string[];
    turnos: string[];
    perfis: Array<{ PHACodigo: number; PHANome: string }>;
}

export interface ParImportacao {
    destino: { TRMCodigo: number; rotulo: string; TRMCurso: string | null; TRMQtdePessoas: number };
    origem: { TRMCodigo: number; rotulo: string; PHANome: string; horarios: Faixa[]; escopo: { todos: boolean; EQPCodigos?: number[] } };
}

export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_UTEIS = [false, true, true, true, true, true, false];
export const PERFIL_NOME_MAX_BYTES = 15;

export function faixaPadrao(): Faixa {
    return { inicio: "07:00", fim: "12:00", dias: [...DIAS_UTEIS] };
}

export function bytesUtf8(texto: string): number {
    return new TextEncoder().encode(texto).length;
}

/** "Seg–Sex", "Seg, Qua, Sex", "Todos os dias". */
export function resumirDias(dias: boolean[]): string {
    const marcados = dias.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
    if (marcados.length === 7) return "Todos os dias";
    if (!marcados.length) return "Nenhum dia";
    const consecutivos = marcados.every((d, i) => i === 0 || d === marcados[i - 1] + 1);
    if (consecutivos && marcados.length >= 3) return `${DIAS[marcados[0]]}–${DIAS[marcados[marcados.length - 1]]}`;
    return marcados.map((i) => DIAS[i]).join(", ");
}

export function cruzaMeiaNoite(f: Faixa): boolean {
    return !!f.inicio && !!f.fim && f.fim <= f.inicio;
}

export function resumirFaixas(faixas: Faixa[]): string {
    if (!faixas.length) return "—";
    return faixas
        .map((f) => `${resumirDias(f.dias)} ${f.inicio}–${f.fim}${cruzaMeiaNoite(f) ? " (+1 dia)" : ""}`)
        .join(" · ");
}

export function rotuloTurma(t: { TRMSerie: string | null; TRMTurma: string }): string {
    return [t.TRMSerie, t.TRMTurma].filter(Boolean).join(" ");
}

export const STATUS_EQUIPAMENTO: Record<StatusEquipamento, { rotulo: string; cor: "success" | "warning" | "error" | "light" | "info" }> = {
    aplicado: { rotulo: "Aplicado", cor: "success" },
    sem_mudanca: { rotulo: "Em dia", cor: "success" },
    removido: { rotulo: "Horário removido", cor: "info" },
    aguardando_membros: { rotulo: "Removendo horário antigo", cor: "warning" },
    ocupado: { rotulo: "Sincronizando em outro processo", cor: "warning" },
    nao_suportado: { rotulo: "Sem suporte", cor: "light" },
    inativo: { rotulo: "Equipamento inativo", cor: "light" },
    erro: { rotulo: "Erro", cor: "error" },
};

export const selectClass =
    "h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-8 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

export const timeInputClass =
    "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";
