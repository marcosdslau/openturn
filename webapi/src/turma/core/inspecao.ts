import {
  ehDiaInteiro,
  ordenarEFundir,
  ROTULO_SENTIDO,
  type CanonicoRegras,
  type Intervalo,
  type RegraCanonica,
} from './perfil-canonico';
import type { HardwareAccessGroupInspection, HardwareDirectionPortals, HardwareSpan } from './ports';
import { SENTIDOS, type Sentido } from './tipos';

export interface RegraAplicada extends RegraCanonica {
  /** Regras de permissão do departamento ligadas ao portal deste sentido. */
  regras: Array<{ id: string; nome: string; semHorario: boolean }>;
  /** Regras de bloqueio (type 0) ligadas ao portal — o sistema não cria; indica alteração externa. */
  bloqueios: number;
}

export type RegrasAplicadas = Record<Sentido, RegraAplicada>;

const MODO_ROTULO = { livre: 'sempre liberado', horario: 'somente nos horários', bloqueado: 'bloqueado' } as const;

/** Segundos do Control iD → minutos; 23:59:59 (86399) conta como fim do dia. */
function spanParaIntervalo(span: HardwareSpan): Intervalo {
  const fim = span.end >= 86399 ? 1440 : Math.round(span.end / 60);
  return [Math.floor(span.start / 60), fim];
}

/**
 * Reconstrói, a partir do que está gravado no equipamento, a regra efetiva de cada sentido:
 * união dos horários das regras de permissão do departamento ligadas ao portal daquele sentido.
 */
export function regrasAplicadas(inspecao: HardwareAccessGroupInspection, portais: HardwareDirectionPortals): RegrasAplicadas {
  const um = (sentido: Sentido): RegraAplicada => {
    const portal = String(portais[sentido]);
    const ligadas = inspecao.regras.filter((r) => r.portais.map(String).includes(portal));
    const permissoes = ligadas.filter((r) => Number(r.tipo) === 1);
    const bloqueios = ligadas.filter((r) => Number(r.tipo) === 0).length;
    const regras = permissoes.map((r) => ({ id: r.id, nome: r.nome, semHorario: r.horarios.length === 0 }));

    if (!permissoes.length) return { modo: 'bloqueado', dias: null, regras, bloqueios };
    // Regra de permissão sem horário: a spec (§8.3) presume "sempre válida" — tratada como livre.
    if (regras.some((r) => r.semHorario)) return { modo: 'livre', dias: null, regras, bloqueios };

    const dias: Intervalo[][] = [[], [], [], [], [], [], []];
    for (const r of permissoes) {
      for (const h of r.horarios) {
        for (const span of h.spans) {
          const intervalo = spanParaIntervalo(span);
          if (intervalo[1] <= intervalo[0]) continue;
          span.dias.forEach((ativo, d) => {
            if (Number(ativo)) dias[d].push([intervalo[0], intervalo[1]]);
          });
        }
      }
    }
    const canonico = dias.map(ordenarEFundir);
    if (ehDiaInteiro(canonico)) return { modo: 'livre', dias: null, regras, bloqueios };
    if (canonico.every((d) => d.length === 0)) return { modo: 'bloqueado', dias: null, regras, bloqueios };
    return { modo: 'horario', dias: canonico, regras, bloqueios };
  };
  return { interna: um('interna'), externa: um('externa') };
}

/** Diferenças entre o configurado e o gravado no equipamento, em linguagem de usuário. Vazio = em conformidade. */
export function compararRegras(desejado: CanonicoRegras, aplicado: RegrasAplicadas): string[] {
  const diferencas: string[] = [];
  for (const sentido of SENTIDOS) {
    const d = desejado[sentido];
    const a = aplicado[sentido];
    const rotulo = ROTULO_SENTIDO[sentido];
    if (d.modo !== a.modo) {
      diferencas.push(`${rotulo}: configurado ${MODO_ROTULO[d.modo]}, no equipamento ${MODO_ROTULO[a.modo]}`);
    } else if (d.modo === 'horario' && JSON.stringify(d.dias) !== JSON.stringify(a.dias)) {
      diferencas.push(`${rotulo}: os horários gravados no equipamento são diferentes dos configurados`);
    }
    if (a.bloqueios > 0) {
      diferencas.push(`${rotulo}: há ${a.bloqueios} regra(s) de bloqueio no equipamento que o sistema não criou`);
    }
  }
  return diferencas;
}
