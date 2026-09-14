import { hashEstavel } from './hash-estavel';
import type { JanelaEntrada } from './tipos';

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
function ordenarEFundir(intervalos: Intervalo[]): Intervalo[] {
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

/** Identidade do perfil (chave de agrupamento). */
export function hashJanelas(canonico: Canonico): string {
  return hashEstavel({ versao: 1, dias: canonico });
}

/** O que deve estar no equipamento: nome + horário. */
export function hashConfig(nome: string, canonico: Canonico): string {
  return hashEstavel({ versao: 1, nome, dias: canonico });
}

/** Colunas de PHAJanela ↔ JanelaEntrada. */
export function janelaParaLinha(j: JanelaEntrada, ordem: number) {
  return {
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

export function linhaParaJanela(l: {
  PHJHoraInicio: string;
  PHJHoraFim: string;
  PHJDom: boolean;
  PHJSeg: boolean;
  PHJTer: boolean;
  PHJQua: boolean;
  PHJQui: boolean;
  PHJSex: boolean;
  PHJSab: boolean;
}): JanelaEntrada {
  return {
    inicio: l.PHJHoraInicio,
    fim: l.PHJHoraFim,
    dias: [l.PHJDom, l.PHJSeg, l.PHJTer, l.PHJQua, l.PHJQui, l.PHJSex, l.PHJSab],
  };
}
