// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/hosts-acesso.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { HardwareAccessHostSnapshot, HardwareAccessSnapshot } from './ports';

/**
 * Comparação da configuração de acesso entre os hosts de um mesmo equipamento.
 *
 * Existe para responder uma pergunta que o código não responde sozinho: numa catraca com leitores
 * faciais, cada host tem banco de objetos próprio (áreas, horários, departamentos separados) ou
 * todos compartilham o mesmo? Enquanto isso for desconhecido, o espelho assume UM banco por
 * equipamento (`AREArea` é única por `EQPCodigo` + id no device) e o sistema escreve só no host
 * efetivo — se os bancos forem separados, as duas coisas estão erradas.
 */

export type VeredictoHosts =
  /** Só um host conhecido: nada a comparar. */
  | 'host_unico'
  /** Todos os hosts têm os mesmos objetos — um banco só, compartilhado. */
  | 'iguais'
  /** Os hosts têm objetos diferentes: cada um tem o seu banco. */
  | 'diferentes'
  /** Algum host não respondeu; não dá para concluir. */
  | 'indisponivel';

export interface ResumoHost {
  host: string;
  origem: string;
  efetivo: boolean;
  erro?: string;
  contagens?: { areas: number; portais: number; horarios: number; grupos: number; regras: number };
}

export interface ComparacaoHosts {
  hosts: ResumoHost[];
  veredicto: VeredictoHosts;
  /** Diferenças em linguagem de usuário, comparando cada host com o efetivo. */
  diferencas: string[];
  /** O que fazer com o resultado, para a tela não deixar a conclusão no ar. */
  recomendacao: string;
}

const COLECOES = [
  ['areas', 'áreas'],
  ['portais', 'portais'],
  ['horarios', 'horários'],
  ['grupos', 'departamentos'],
] as const;

/** Identidade de um objeto: id no device + nome. Dois hosts "iguais" têm exatamente o mesmo conjunto. */
function chaves(snapshot: HardwareAccessSnapshot, colecao: (typeof COLECOES)[number][0]): Map<string, string> {
  const itens = snapshot[colecao] as Array<{ id: string; nome: string }>;
  return new Map(itens.map((i) => [String(i.id), i.nome]));
}

function contagens(s: HardwareAccessSnapshot) {
  return {
    areas: s.areas.length,
    portais: s.portais.length,
    horarios: s.horarios.length,
    grupos: s.grupos.length,
    regras: s.regras.length,
  };
}

export function compararHosts(leituras: HardwareAccessHostSnapshot[]): ComparacaoHosts {
  const hosts: ResumoHost[] = leituras.map((l) => ({
    host: l.host,
    origem: l.origem,
    efetivo: l.efetivo,
    ...(l.erro ? { erro: l.erro } : {}),
    ...(l.snapshot ? { contagens: contagens(l.snapshot) } : {}),
  }));

  const comErro = leituras.filter((l) => !l.snapshot);
  const ok = leituras.filter((l) => l.snapshot);

  if (leituras.length <= 1) {
    return {
      hosts,
      veredicto: 'host_unico',
      diferencas: [],
      recomendacao:
        'Um host só: a configuração de acesso deste equipamento não tem ambiguidade de destino.',
    };
  }

  if (comErro.length) {
    return {
      hosts,
      veredicto: 'indisponivel',
      diferencas: comErro.map((l) => `${l.host} (${l.origem}) não respondeu: ${l.erro}`),
      recomendacao:
        'Sem ler todos os hosts não dá para concluir. Verifique o acesso aos que falharam e compare de novo.',
    };
  }

  const referencia = ok.find((l) => l.efetivo) ?? ok[0];
  const diferencas: string[] = [];

  for (const outro of ok) {
    if (outro === referencia) continue;
    for (const [colecao, rotulo] of COLECOES) {
      const a = chaves(referencia.snapshot!, colecao);
      const b = chaves(outro.snapshot!, colecao);

      const soNoOutro = [...b].filter(([id]) => !a.has(id));
      const soNaReferencia = [...a].filter(([id]) => !b.has(id));
      const nomeDiferente = [...a].filter(([id, nome]) => b.has(id) && b.get(id) !== nome);

      if (soNoOutro.length) {
        diferencas.push(
          `${rotulo} só em ${outro.host}: ${soNoOutro.map(([id, nome]) => `${nome || '(sem nome)'} #${id}`).join(', ')}`,
        );
      }
      if (soNaReferencia.length) {
        diferencas.push(
          `${rotulo} só em ${referencia.host}: ${soNaReferencia.map(([id, nome]) => `${nome || '(sem nome)'} #${id}`).join(', ')}`,
        );
      }
      if (nomeDiferente.length) {
        diferencas.push(
          `${rotulo} com nome diferente entre ${referencia.host} e ${outro.host}: ` +
            nomeDiferente.map(([id, nome]) => `#${id} "${nome}" vs "${b.get(id)}"`).join(', '),
        );
      }
    }
  }

  if (!diferencas.length) {
    return {
      hosts,
      veredicto: 'iguais',
      diferencas: [],
      recomendacao:
        'Os hosts têm os mesmos objetos: é um banco só, compartilhado. Escrever no host efetivo basta.',
    };
  }

  return {
    hosts,
    veredicto: 'diferentes',
    diferencas,
    recomendacao:
      'Os hosts têm bancos de objetos separados. O sistema escreve só no host efetivo, então a ' +
      'configuração dos demais está fora do controle do projeto — não use este equipamento para ' +
      'controle por turma até isso ser resolvido.',
  };
}
