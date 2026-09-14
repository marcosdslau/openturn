import { hashEstavel } from './hash-estavel';
import { SENTIDOS, type JanelaEntrada, type ModoSentido, type RegrasEntrada, type Sentido } from './tipos';

/** [inicio, fim) em minutos desde 00:00. */
export type Intervalo = [number, number];
/** 7 posições (dom..sab), cada uma com intervalos ordenados e fundidos. */
export type Canonico = Intervalo[][];

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MAX_FAIXAS = 10;

export function minutos(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

function formatar(min: number): string {
  if (min >= 1440) return '24:00';
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Expande as faixas em intervalos por dia, sem fundir. Faixa com `fim <= inicio`
 * cruza a meia-noite: vira [inicio, 24h) no dia marcado e [0, fim) no dia seguinte.
 * Cada intervalo carrega o índice da faixa de origem, para mensagens de erro.
 */
function expandir(janelas: JanelaEntrada[]): Array<Array<{ i: Intervalo; faixa: number }>> {
  const dias: Array<Array<{ i: Intervalo; faixa: number }>> = [[], [], [], [], [], [], []];
  janelas.forEach((j, faixa) => {
    const ini = minutos(j.inicio);
    const fim = minutos(j.fim);
    j.dias.forEach((ativo, d) => {
      if (!ativo) return;
      if (fim > ini) {
        dias[d].push({ i: [ini, fim], faixa });
      } else {
        dias[d].push({ i: [ini, 1440], faixa });
        if (fim > 0) dias[(d + 1) % 7].push({ i: [0, fim], faixa });
      }
    });
  });
  return dias;
}

/**
 * Regras de horário (§11.3 da spec). Retorna a lista de erros — vazia quando válido.
 * A sobreposição é verificada na forma expandida, ANTES da fusão, incluindo o
 * transbordo da meia-noite para o dia seguinte.
 */
export function validarJanelas(janelas: JanelaEntrada[], exigirAoMenosUma = true): string[] {
  const erros: string[] = [];
  if (!Array.isArray(janelas)) return ['Informe as faixas de horário'];
  if (exigirAoMenosUma && janelas.length === 0) erros.push('Informe ao menos uma faixa de horário');
  if (janelas.length > MAX_FAIXAS) erros.push(`Máximo de ${MAX_FAIXAS} faixas por turma`);

  janelas.forEach((j, idx) => {
    const n = idx + 1;
    if (!j || typeof j.inicio !== 'string' || !HHMM.test(j.inicio)) {
      erros.push(`Faixa ${n}: início deve estar no formato HH:mm`);
    }
    if (!j || typeof j.fim !== 'string' || !HHMM.test(j.fim)) {
      erros.push(`Faixa ${n}: fim deve estar no formato HH:mm`);
    }
    if (!j || !Array.isArray(j.dias) || j.dias.length !== 7) {
      erros.push(`Faixa ${n}: dias deve ter 7 posições (dom..sáb)`);
    } else if (!j.dias.some(Boolean)) {
      erros.push(`Faixa ${n}: marque ao menos um dia`);
    }
    if (j && j.inicio === j.fim && HHMM.test(j.inicio ?? '')) {
      erros.push(`Faixa ${n}: início e fim não podem ser iguais`);
    }
  });
  if (erros.length) return erros;

  const expandido = expandir(janelas);
  expandido.forEach((intervalos, d) => {
    const ordenados = [...intervalos].sort((a, b) => a.i[0] - b.i[0]);
    for (let k = 1; k < ordenados.length; k++) {
      const anterior = ordenados[k - 1];
      const atual = ordenados[k];
      if (atual.i[0] < anterior.i[1]) {
        erros.push(
          `Faixas ${anterior.faixa + 1} e ${atual.faixa + 1} se sobrepõem em ${DIAS_ABREV[d]} ` +
            `(${formatar(atual.i[0])}–${formatar(Math.min(anterior.i[1], atual.i[1]))})`,
        );
      }
    }
  });
  return erros;
}

/** Ordena e funde intervalos sobrepostos ou adjacentes (fim == inicio). */
export function ordenarEFundir(intervalos: Intervalo[]): Intervalo[] {
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const saida: Intervalo[] = [];
  for (const [ini, fim] of ordenados) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && ini <= ultimo[1]) {
      ultimo[1] = Math.max(ultimo[1], fim);
    } else {
      saida.push([ini, fim]);
    }
  }
  return saida;
}

/**
 * Forma canônica: duas configurações que liberam exatamente os mesmos minutos
 * produzem o mesmo resultado, independentemente de como foram digitadas.
 * Pressupõe janelas já validadas.
 */
export function canonizar(janelas: JanelaEntrada[]): Canonico {
  return expandir(janelas).map((intervalos) => ordenarEFundir(intervalos.map((x) => [x.i[0], x.i[1]])));
}

// ── Regras por sentido (Entrada na Área Interna / Externa) ──────────────────

export const ROTULO_SENTIDO: Record<Sentido, string> = {
  interna: 'Entrada na Área Interna',
  externa: 'Entrada na Área Externa',
};

export const MODOS_SENTIDO: readonly ModoSentido[] = ['livre', 'horario', 'bloqueado'];

export interface RegraCanonica {
  modo: ModoSentido;
  /** Só em modo 'horario'. */
  dias: Canonico | null;
}

export type CanonicoRegras = Record<Sentido, RegraCanonica>;

/** Aceita o formato atual (`regras`) e o anterior (`horarios`, aplicado aos dois sentidos). */
export function normalizarRegras(entrada: { regras?: RegrasEntrada | null; horarios?: JanelaEntrada[] | null }): RegrasEntrada | null {
  if (entrada?.regras) return entrada.regras;
  if (Array.isArray(entrada?.horarios)) {
    return {
      interna: { modo: 'horario', horarios: entrada.horarios },
      externa: { modo: 'horario', horarios: entrada.horarios },
    };
  }
  return null;
}

/** Regras de cada sentido + regra entre sentidos. Retorna a lista de erros (vazia = válido). */
export function validarRegras(regras: RegrasEntrada | null | undefined): string[] {
  if (!regras || typeof regras !== 'object') return ['Informe as regras de Entrada na Área Interna e na Área Externa'];
  const erros: string[] = [];
  for (const sentido of SENTIDOS) {
    const regra = regras[sentido];
    const rotulo = ROTULO_SENTIDO[sentido];
    if (!regra || !MODOS_SENTIDO.includes(regra.modo)) {
      erros.push(`${rotulo}: informe o modo (livre, horario ou bloqueado)`);
      continue;
    }
    if (regra.modo === 'horario') {
      for (const e of validarJanelas(regra.horarios ?? [])) erros.push(`${rotulo}: ${e}`);
    }
  }
  if (!erros.length && regras.interna.modo === 'bloqueado' && regras.externa.modo === 'bloqueado') {
    erros.push('Os dois sentidos estão bloqueados: nenhuma pessoa da turma passaria na catraca');
  }
  return erros;
}

/** Pressupõe regras validadas. */
export function canonizarRegras(regras: RegrasEntrada): CanonicoRegras {
  const um = (sentido: Sentido): RegraCanonica => {
    const r = regras[sentido];
    return { modo: r.modo, dias: r.modo === 'horario' ? canonizar(r.horarios ?? []) : null };
  };
  return { interna: um('interna'), externa: um('externa') };
}

/** Identidade do perfil (chave de agrupamento): as duas regras juntas. */
export function hashJanelas(canonico: CanonicoRegras): string {
  return hashEstavel({ versao: 2, interna: canonico.interna, externa: canonico.externa });
}

/** O que deve estar no equipamento: nome + regras dos dois sentidos. */
export function hashConfig(nome: string, canonico: CanonicoRegras): string {
  return hashEstavel({ versao: 2, nome, interna: canonico.interna, externa: canonico.externa });
}

/** 7 dias × dia inteiro — forma canônica de "sempre liberado" para diagramas e comparação. */
export function diaInteiro(): Canonico {
  return [0, 1, 2, 3, 4, 5, 6].map(() => [[0, 1440] as Intervalo]);
}

export function ehDiaInteiro(c: Canonico): boolean {
  return c.length === 7 && c.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440);
}

// ── Colunas do banco ────────────────────────────────────────────────────────

export type SentidoDb = 'INTERNA' | 'EXTERNA';
export type ModoDb = 'LIVRE' | 'HORARIO' | 'BLOQUEADO';

export const sentidoParaDb = (s: Sentido): SentidoDb => (s === 'interna' ? 'INTERNA' : 'EXTERNA');
export const sentidoDeDb = (s: SentidoDb): Sentido => (s === 'INTERNA' ? 'interna' : 'externa');
export const modoParaDb = (m: ModoSentido): ModoDb => m.toUpperCase() as ModoDb;
export const modoDeDb = (m: ModoDb): ModoSentido => m.toLowerCase() as ModoSentido;

/** Colunas de PHAJanela ↔ JanelaEntrada. */
export function janelaParaLinha(j: JanelaEntrada, ordem: number, sentido: Sentido) {
  return {
    PHJSentido: sentidoParaDb(sentido),
    PHJHoraInicio: j.inicio,
    PHJHoraFim: j.fim,
    PHJDom: !!j.dias[0],
    PHJSeg: !!j.dias[1],
    PHJTer: !!j.dias[2],
    PHJQua: !!j.dias[3],
    PHJQui: !!j.dias[4],
    PHJSex: !!j.dias[5],
    PHJSab: !!j.dias[6],
    PHJOrdem: ordem,
  };
}

type LinhaJanela = {
  PHJSentido: SentidoDb;
  PHJHoraInicio: string;
  PHJHoraFim: string;
  PHJDom: boolean;
  PHJSeg: boolean;
  PHJTer: boolean;
  PHJQua: boolean;
  PHJQui: boolean;
  PHJSex: boolean;
  PHJSab: boolean;
  PHJOrdem?: number;
};

export function linhaParaJanela(l: LinhaJanela): JanelaEntrada {
  return {
    inicio: l.PHJHoraInicio,
    fim: l.PHJHoraFim,
    dias: [l.PHJDom, l.PHJSeg, l.PHJTer, l.PHJQua, l.PHJQui, l.PHJSex, l.PHJSab],
  };
}

/** Linhas de PHAJanela para gravar a partir das regras. */
export function regrasParaLinhas(regras: RegrasEntrada) {
  return SENTIDOS.flatMap((sentido) =>
    regras[sentido].modo === 'horario'
      ? (regras[sentido].horarios ?? []).map((j, i) => janelaParaLinha(j, i + 1, sentido))
      : [],
  );
}

/** Perfil do banco (modos + janelas) → regras no formato de entrada. */
export function regrasDoPerfil(perfil: { PHAModoInterna: ModoDb; PHAModoExterna: ModoDb; janelas: LinhaJanela[] }): RegrasEntrada {
  const ordenadas = [...perfil.janelas].sort((a, b) => (a.PHJOrdem ?? 0) - (b.PHJOrdem ?? 0));
  const um = (sentido: Sentido, modo: ModoDb) => {
    const m = modoDeDb(modo);
    return m === 'horario'
      ? { modo: m, horarios: ordenadas.filter((j) => sentidoDeDb(j.PHJSentido) === sentido).map(linhaParaJanela) }
      : { modo: m };
  };
  return { interna: um('interna', perfil.PHAModoInterna), externa: um('externa', perfil.PHAModoExterna) };
}
