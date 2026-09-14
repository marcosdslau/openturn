/** Tipos e utilitários da tela Turmas (controle de acesso por turma — working/Controle-turma/README.md). */

export interface Faixa {
    inicio: string;
    fim: string;
    /** dom..sab */
    dias: boolean[];
}

/**
 * Sentido = área de destino do giro (SpecControlId.md §5).
 * interna: Área Externa → Área Interna (entrar na escola); externa: Área Interna → Área Externa (sair).
 */
export type Sentido = "interna" | "externa";
export const SENTIDOS: Sentido[] = ["interna", "externa"];

export type ModoSentido = "livre" | "horario" | "bloqueado";

export interface RegraSentido {
    modo: ModoSentido;
    horarios?: Faixa[];
}

export type Regras = Record<Sentido, RegraSentido>;

/** [início, fim) em minutos desde 00:00. */
export type Intervalo = [number, number];

/** Forma canônica devolvida pela API: minutos liberados por dia (dom..sab); null quando livre/bloqueado. */
export interface RegraCanonica {
    modo: ModoSentido;
    dias: Intervalo[][] | null;
}

export type CanonicoRegras = Record<Sentido, RegraCanonica>;

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
    /** No escopo, mas sem Área Interna/Externa preparadas. */
    semSentido: number;
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
    perfil: { PHACodigo: number; PHANome: string; qtdeTurmas: number; modos: Record<Sentido, ModoSentido> } | null;
    escopo: Escopo & { total: number };
    sync: SyncResumo | null;
}

/** GET /turma/:trm/pessoas — pessoas com matrícula ativa vinculada à turma. */
export interface PessoaDaTurma {
    PESCodigo: number;
    PESNome: string;
    PESNomeSocial: string | null;
    PESAtivo: boolean;
    /** Miniatura 72×72. */
    PESFotoBase64: string | null;
    PESFotoExtensao: string | null;
    PESImageError: unknown;
    matriculas: string[];
    /** Turma que define o acesso da pessoa; pode ser outra, por prioridade. */
    turmaDeAcesso: { TRMCodigo: number; estaTurma: boolean; rotulo: string } | null;
}

export interface PessoasDaTurmaResposta {
    turma: { TRMCodigo: number; rotulo: string; TRMCurso: string | null; TRMQtdePessoas: number };
    data: PessoaDaTurma[];
    meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Vem na listagem quando a busca por texto não encontra nada no catálogo. */
export interface SemResultadoBusca {
    /** Matrículas ativas com o termo em turma, curso ou série (o que a tela Matrículas pesquisa). */
    matriculas: number;
    matriculasSemCatalogo: number;
    turmasForaDoErp: number;
    turmasNoCatalogo: number;
    catalogoAtualizadoEm: string | null;
}

export interface EquipamentoTurma {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
    EQPAtivo: boolean;
    suportado: boolean;
    sentido: { preparado: boolean; validado: boolean; invertido: boolean };
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
    regras: Regras | null;
    canonico: CanonicoRegras | null;
    perfil: { PHACodigo: number; PHANome: string; outrasTurmas: string[] } | null;
    escopo: Escopo;
    equipamentos: EquipamentoTurma[];
}

export interface PreviewPerfil {
    erros: string[];
    canonico: CanonicoRegras | null;
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
    | "sentido_nao_preparado"
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
    regras: Regras;
    canonico: CanonicoRegras;
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
    origem: {
        TRMCodigo: number;
        rotulo: string;
        PHANome: string;
        regras: Regras;
        canonico: CanonicoRegras;
        escopo: { todos: boolean; EQPCodigos?: number[] };
    };
}

// ── áreas por equipamento (aba Equipamentos) ─────────────────────────────

export interface CatraHost {
    host: string;
    catra_role?: string | null;
    catra_side_to_enter?: string | null;
    catra_default_fsm?: string | null;
    erro?: string;
}

export interface SentidoVisao {
    preparado: boolean;
    invertido: boolean;
    validadoEm: string | null;
    preparadoEm: string | null;
    /** Já considerando a inversão: portal em que vale cada sentido. */
    portais: Record<Sentido, string> | null;
    areas: Record<Sentido, string | null> | null;
    catra: CatraHost[] | null;
    diagnostico: {
        criados?: string[];
        portaisPreexistentes?: Array<{ id: string; nome: string }>;
        regrasReplicadas?: number;
        alertas?: string[];
    } | null;
    ultimoErro: string | null;
}

export interface EquipamentoSentidoItem {
    EQPCodigo: number;
    EQPDescricao: string | null;
    EQPMarca: string | null;
    EQPModelo: string | null;
    EQPAtivo: boolean;
    suportado: boolean;
    turmasNoEscopo: number;
    sentido: SentidoVisao;
}

export interface AreaHardware {
    id: string;
    nome: string;
}

export interface PortalHardware {
    id: string;
    nome: string;
    areaFromId: string | null;
    areaToId: string | null;
}

export interface LeituraSentido {
    sentido: SentidoVisao;
    leitura: { catra: CatraHost[]; areas: AreaHardware[]; portais: PortalHardware[] };
    alertas: string[];
}

export interface RegraAplicada extends RegraCanonica {
    regras: Array<{ id: string; nome: string; semHorario: boolean }>;
    bloqueios: number;
}

/** GET /turma/:trm/aplicado/:eqp — o que está gravado no equipamento para a turma. */
export interface LeituraRegraAplicada {
    TRMCodigo: number;
    equipamento: { EQPCodigo: number; EQPDescricao: string | null };
    perfil: { PHACodigo: number; PHANome: string };
    portais: Record<Sentido, string>;
    invertido: boolean;
    /** null = a turma não deveria ter regra neste equipamento. */
    esperado: CanonicoRegras | null;
    /** null = departamento não encontrado no equipamento. */
    aplicado: Record<Sentido, RegraAplicada> | null;
    diferencas: string[];
    membros: number;
    lidoEm: string;
}

// ── constantes e formatação ──────────────────────────────────────────────

export const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const DIAS_UTEIS = [false, true, true, true, true, true, false];
export const PERFIL_NOME_MAX_BYTES = 15;

export const SENTIDO_INFO: Record<Sentido, { titulo: string; curto: string; fluxo: string; descricao: string }> = {
    interna: {
        titulo: "Entrada na Área Interna",
        curto: "Entrada",
        fluxo: "Área Externa → Área Interna",
        descricao: "Giro para dentro da escola.",
    },
    externa: {
        titulo: "Entrada na Área Externa",
        curto: "Saída",
        fluxo: "Área Interna → Área Externa",
        descricao: "Giro para fora da escola.",
    },
};

export const MODO_INFO: Record<ModoSentido, { rotulo: string; descricao: string }> = {
    livre: { rotulo: "Sempre liberado", descricao: "Passa em qualquer dia e horário, inclusive feriados." },
    horario: { rotulo: "Somente nos horários", descricao: "Passa apenas dentro das faixas abaixo." },
    bloqueado: { rotulo: "Bloqueado", descricao: "Nenhuma pessoa da turma passa neste sentido." },
};

export function faixaPadrao(): Faixa {
    return { inicio: "07:00", fim: "12:00", dias: [...DIAS_UTEIS] };
}

export function regrasPadrao(): Regras {
    return { interna: { modo: "horario", horarios: [faixaPadrao()] }, externa: { modo: "horario", horarios: [faixaPadrao()] } };
}

/** Garante faixas editáveis ao alternar para "horário" sem perder o que já foi digitado. */
export function regrasParaEdicao(regras: Regras | null): Regras {
    if (!regras) return regrasPadrao();
    const um = (r: RegraSentido): RegraSentido => ({ modo: r.modo, horarios: r.horarios?.length ? r.horarios : [faixaPadrao()] });
    return { interna: um(regras.interna), externa: um(regras.externa) };
}

/** Corpo enviado à API: faixas só no modo horário. */
export function regrasParaEnvio(regras: Regras): Regras {
    const um = (r: RegraSentido): RegraSentido => (r.modo === "horario" ? { modo: "horario", horarios: r.horarios ?? [] } : { modo: r.modo });
    return { interna: um(regras.interna), externa: um(regras.externa) };
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

export function resumirRegra(r: RegraSentido): string {
    if (r.modo === "horario") return resumirFaixas(r.horarios ?? []);
    return MODO_INFO[r.modo].rotulo;
}

export function rotuloTurma(t: { TRMSerie: string | null; TRMTurma: string }): string {
    return [t.TRMSerie, t.TRMTurma].filter(Boolean).join(" ");
}

export function horaDeMinutos(m: number): string {
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function minutos(hhmm: string): number | null {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fundir(intervalos: Intervalo[]): Intervalo[] {
    const ordenados = [...intervalos].sort((a, b) => a[0] - b[0]);
    const saida: Intervalo[] = [];
    for (const [i, f] of ordenados) {
        const ultimo = saida[saida.length - 1];
        if (ultimo && i <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], f);
        else saida.push([i, f]);
    }
    return saida;
}

/**
 * Prévia imediata do diagrama enquanto o usuário digita. Mesma ideia da canonização da API
 * (faixa que cruza a meia-noite continua no dia seguinte), mas tolerante: ignora faixas incompletas.
 * A validação oficial continua sendo a do preview da API.
 */
export function canonizarLocal(regras: Regras): CanonicoRegras {
    const um = (r: RegraSentido): RegraCanonica => {
        if (r.modo !== "horario") return { modo: r.modo, dias: null };
        const dias: Intervalo[][] = [[], [], [], [], [], [], []];
        for (const f of r.horarios ?? []) {
            const ini = minutos(f.inicio);
            const fim = minutos(f.fim);
            if (ini == null || fim == null || ini === fim) continue;
            f.dias.forEach((ativo, d) => {
                if (!ativo) return;
                if (fim > ini) dias[d].push([ini, fim]);
                else {
                    dias[d].push([ini, 1440]);
                    if (fim > 0) dias[(d + 1) % 7].push([0, fim]);
                }
            });
        }
        return { modo: "horario", dias: dias.map(fundir) };
    };
    return { interna: um(regras.interna), externa: um(regras.externa) };
}

/** Minutos liberados de um sentido por dia — livre = dia inteiro; bloqueado = nada. */
export function intervalosDoDia(regra: RegraCanonica, dia: number): Intervalo[] {
    if (regra.modo === "livre") return [[0, 1440]];
    if (regra.modo === "bloqueado") return [];
    return regra.dias?.[dia] ?? [];
}

/** Minutos que estão em um e não no outro (diferença simétrica). */
export function diferencaIntervalos(a: Intervalo[], b: Intervalo[]): Intervalo[] {
    const pontos = [...new Set([0, 1440, ...a.flat(), ...b.flat()])].sort((x, y) => x - y);
    const contem = (lista: Intervalo[], m: number) => lista.some(([i, f]) => m >= i && m < f);
    const saida: Intervalo[] = [];
    for (let k = 0; k < pontos.length - 1; k++) {
        const meio = (pontos[k] + pontos[k + 1]) / 2;
        if (contem(a, meio) !== contem(b, meio)) saida.push([pontos[k], pontos[k + 1]]);
    }
    return fundir(saida);
}

export const STATUS_EQUIPAMENTO: Record<StatusEquipamento, { rotulo: string; cor: "success" | "warning" | "error" | "light" | "info" }> = {
    aplicado: { rotulo: "Aplicado", cor: "success" },
    sem_mudanca: { rotulo: "Em dia", cor: "success" },
    removido: { rotulo: "Horário removido", cor: "info" },
    aguardando_membros: { rotulo: "Removendo horário antigo", cor: "warning" },
    ocupado: { rotulo: "Sincronizando em outro processo", cor: "warning" },
    nao_suportado: { rotulo: "Sem suporte", cor: "light" },
    sentido_nao_preparado: { rotulo: "Áreas não preparadas", cor: "warning" },
    inativo: { rotulo: "Equipamento inativo", cor: "light" },
    erro: { rotulo: "Erro", cor: "error" },
};

export const selectClass =
    "h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-8 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

export const timeInputClass =
    "h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";
