import type { EQPEquipamento, Prisma, PrismaClient } from '@prisma/client';
import type { AccessGroupPort, HardwareAccessSnapshot } from './ports';

/**
 * Espelho da configuração de acesso de um equipamento (fase 1 de
 * docs/controle-por-turma/PLANO-IMPLEMENTACAO.md).
 *
 * O equipamento é a FONTE DA VERDADE: aqui só se lê dele e se atualiza o retrato local. Nada é
 * escrito na catraca por este módulo.
 *
 * O que é espelhado e o que não é:
 * - `areas`, `portals`, `time_zones`/`time_spans` são objetos do device → espelho completo.
 * - `groups` e `access_rules` só entram para os departamentos já ADOTADOS (DEQ). Grupos sem adoção
 *   ficam de fora de propósito: adotar é decisão de gente, não do sync.
 * - `HRAHorarioArea` (horário ↔ área) é configuração NOSSA, não existe no device. Só é semeada
 *   quando o horário aparece pela primeira vez, a partir das regras que já o usam — é o que dá
 *   sentido a "adotar o que já existe".
 */

const TIMEOUT_TRANSACAO_MS = 60_000;

export interface ResumoEspelho {
  areas: { criadas: number; atualizadas: number; removidas: number };
  portais: { criados: number; atualizados: number; removidos: number };
  horarios: { criados: number; atualizados: number; removidos: number; janelas: number };
  /** Vínculos horário ↔ área semeados a partir das regras existentes (só em horário novo). */
  vinculosSemeados: number;
  departamentos: { adotados: number; regras: number };
  /** Grupos do equipamento ainda sem adoção — candidatos da tela de departamentos. */
  gruposNaoAdotados: Array<{ id: string; nome: string }>;
  /**
   * Coisas encontradas no equipamento que o modelo não representa. Não são erro: são o motivo de a
   * tela mostrar divergência em vez de o sync "corrigir" por conta própria.
   */
  observacoes: {
    /** Regras `type: 0`. O projeto é allow-only e nunca as cria. */
    bloqueios: number;
    /** Regras sem horário — o firmware as trata como sempre válidas (README §8.3). */
    regrasSemHorario: number;
    /** Mesmo horário usado por mais de uma regra no mesmo departamento; o espelho funde as áreas. */
    regrasDuplicadas: number;
    /** Deleções foram puladas porque o equipamento respondeu vazio (leitura suspeita). */
    leituraVazia: boolean;
  };
}

function vazio(): ResumoEspelho {
  return {
    areas: { criadas: 0, atualizadas: 0, removidas: 0 },
    portais: { criados: 0, atualizados: 0, removidos: 0 },
    horarios: { criados: 0, atualizados: 0, removidos: 0, janelas: 0 },
    vinculosSemeados: 0,
    departamentos: { adotados: 0, regras: 0 },
    gruposNaoAdotados: [],
    observacoes: { bloqueios: 0, regrasSemHorario: 0, regrasDuplicadas: 0, leituraVazia: false },
  };
}

/** dom..sab, 0/1 → colunas booleanas da janela. */
function janelaParaLinha(span: HardwareAccessSnapshot['horarios'][number]['spans'][number], ordem: number) {
  const dia = (i: number) => !!Number(span.dias[i] ?? 0);
  const feriado = (i: number) => !!Number(span.feriados?.[i] ?? 0);
  return {
    HRJInicioSeg: Number(span.start ?? 0),
    HRJFimSeg: Number(span.end ?? 0),
    HRJDom: dia(0),
    HRJSeg: dia(1),
    HRJTer: dia(2),
    HRJQua: dia(3),
    HRJQui: dia(4),
    HRJSex: dia(5),
    HRJSab: dia(6),
    HRJFeriado1: feriado(0),
    HRJFeriado2: feriado(1),
    HRJFeriado3: feriado(2),
    HRJOrdem: ordem,
  };
}

/**
 * Aplica um retrato já lido. Separado de `lerEquipamento` para poder ser testado com um snapshot
 * de mentira, sem equipamento.
 */
export async function aplicarSnapshot(
  prisma: PrismaClient,
  ins: number,
  eqpCodigo: number,
  snapshot: HardwareAccessSnapshot,
): Promise<ResumoEspelho> {
  const resumo = vazio();
  const agora = new Date();

  // Uma leitura que não trouxe NADA quase sempre é falha de comunicação disfarçada de sucesso.
  // Atualiza o que veio, mas não apaga o espelho inteiro com base nela.
  const leituraVazia =
    !snapshot.areas.length && !snapshot.portais.length && !snapshot.horarios.length && !snapshot.grupos.length;
  resumo.observacoes.leituraVazia = leituraVazia;

  await prisma.$transaction(
    async (tx) => {
      // ── áreas ──────────────────────────────────────────────────────────
      const areasAntes = await tx.aREArea.findMany({
        where: { INSInstituicaoCodigo: ins, EQPCodigo: eqpCodigo },
        select: { ARECodigo: true, AREIdDevice: true },
      });
      const areaPorDevice = new Map(areasAntes.map((a) => [a.AREIdDevice, a.ARECodigo]));

      for (const area of snapshot.areas) {
        const existente = areaPorDevice.get(area.id);
        const linha = await tx.aREArea.upsert({
          where: { EQPCodigo_AREIdDevice: { EQPCodigo: eqpCodigo, AREIdDevice: area.id } },
          create: {
            INSInstituicaoCodigo: ins,
            EQPCodigo: eqpCodigo,
            AREIdDevice: area.id,
            ARENome: area.nome,
            ARELidoEm: agora,
          },
          update: { ARENome: area.nome, ARELidoEm: agora },
          select: { ARECodigo: true },
        });
        areaPorDevice.set(area.id, linha.ARECodigo);
        if (existente) resumo.areas.atualizadas++;
        else resumo.areas.criadas++;
      }

      if (!leituraVazia) {
        const vistos = new Set(snapshot.areas.map((a) => a.id));
        const sumiram = areasAntes.filter((a) => !vistos.has(a.AREIdDevice));
        if (sumiram.length) {
          await tx.aREArea.deleteMany({ where: { ARECodigo: { in: sumiram.map((a) => a.ARECodigo) } } });
          sumiram.forEach((a) => areaPorDevice.delete(a.AREIdDevice));
          resumo.areas.removidas = sumiram.length;
        }
      }

      // ── portais ────────────────────────────────────────────────────────
      const portaisAntes = await tx.pTLPortal.findMany({
        where: { INSInstituicaoCodigo: ins, EQPCodigo: eqpCodigo },
        select: { PTLCodigo: true, PTLIdDevice: true },
      });
      const portalConhecido = new Set(portaisAntes.map((p) => p.PTLIdDevice));

      for (const portal of snapshot.portais) {
        const dados = {
          PTLNome: portal.nome,
          PTLAreaDeCodigo: portal.areaFromId ? (areaPorDevice.get(portal.areaFromId) ?? null) : null,
          PTLAreaParaCodigo: portal.areaToId ? (areaPorDevice.get(portal.areaToId) ?? null) : null,
          PTLLidoEm: agora,
        };
        await tx.pTLPortal.upsert({
          where: { EQPCodigo_PTLIdDevice: { EQPCodigo: eqpCodigo, PTLIdDevice: portal.id } },
          create: { INSInstituicaoCodigo: ins, EQPCodigo: eqpCodigo, PTLIdDevice: portal.id, ...dados },
          update: dados,
        });
        if (portalConhecido.has(portal.id)) resumo.portais.atualizados++;
        else resumo.portais.criados++;
      }

      if (!leituraVazia) {
        const vistos = new Set(snapshot.portais.map((p) => p.id));
        const sumiram = portaisAntes.filter((p) => !vistos.has(p.PTLIdDevice));
        if (sumiram.length) {
          await tx.pTLPortal.deleteMany({ where: { PTLCodigo: { in: sumiram.map((p) => p.PTLCodigo) } } });
          resumo.portais.removidos = sumiram.length;
        }
      }

      // ── horários e janelas ─────────────────────────────────────────────
      const horariosAntes = await tx.hORHorario.findMany({
        where: { INSInstituicaoCodigo: ins, EQPCodigo: eqpCodigo },
        select: { HORCodigo: true, HORIdDevice: true },
      });
      const horarioPorDevice = new Map(horariosAntes.map((h) => [h.HORIdDevice, h.HORCodigo]));
      /**
       * Só horário visto pela PRIMEIRA vez entra aqui. "Sem vínculo" não serve como critério:
       * o operador que tirou a última área pela tela decidiu que o horário não libera área
       * nenhuma, e uma releitura do equipamento não pode desfazer isso em silêncio.
       */
      const horariosNovos = new Set<string>();

      for (const horario of snapshot.horarios) {
        const jaExistia = horarioPorDevice.has(horario.id);
        const linha = await tx.hORHorario.upsert({
          where: { EQPCodigo_HORIdDevice: { EQPCodigo: eqpCodigo, HORIdDevice: horario.id } },
          create: {
            INSInstituicaoCodigo: ins,
            EQPCodigo: eqpCodigo,
            HORIdDevice: horario.id,
            HORNome: horario.nome,
            HORLidoEm: agora,
          },
          update: { HORNome: horario.nome, HORLidoEm: agora },
          select: { HORCodigo: true },
        });
        horarioPorDevice.set(horario.id, linha.HORCodigo);
        if (jaExistia) resumo.horarios.atualizados++;
        else {
          resumo.horarios.criados++;
          horariosNovos.add(horario.id);
        }

        // Janelas são espelho puro: reescrever é mais simples e mais correto que diferenciar.
        await tx.hORJanela.deleteMany({ where: { HORCodigo: linha.HORCodigo } });
        if (horario.spans.length) {
          await tx.hORJanela.createMany({
            data: horario.spans.map((span, i) => ({
              INSInstituicaoCodigo: ins,
              HORCodigo: linha.HORCodigo,
              ...janelaParaLinha(span, i + 1),
            })),
          });
          resumo.horarios.janelas += horario.spans.length;
        }
      }

      if (!leituraVazia) {
        const vistos = new Set(snapshot.horarios.map((h) => h.id));
        const sumiram = horariosAntes.filter((h) => !vistos.has(h.HORIdDevice));
        if (sumiram.length) {
          await tx.hORHorario.deleteMany({ where: { HORCodigo: { in: sumiram.map((h) => h.HORCodigo) } } });
          sumiram.forEach((h) => horarioPorDevice.delete(h.HORIdDevice));
          resumo.horarios.removidos = sumiram.length;
        }
      }

      // ── vínculo horário ↔ área, semeado a partir das regras existentes ──
      // "Este horário libera a ENTRADA nestas áreas": a área de destino (area_to) dos portais das
      // regras de permissão que já usam o horário. Só na primeira vez que o horário aparece — o que
      // o operador configurou (ou apagou) depois nunca é refeito por uma leitura.
      const areaDoPortal = new Map(snapshot.portais.map((p) => [p.id, p.areaToId]));
      const permissoes = snapshot.regras.filter((r) => Number(r.tipo) === 1);
      const aSemear: Prisma.HRAHorarioAreaCreateManyInput[] = [];
      for (const idDevice of horariosNovos) {
        const areas = new Set<number>();
        for (const regra of permissoes) {
          if (!regra.horarioIds.includes(idDevice)) continue;
          for (const portalId of regra.portalIds) {
            const areaId = areaDoPortal.get(portalId);
            const codigo = areaId ? areaPorDevice.get(areaId) : undefined;
            if (codigo != null) areas.add(codigo);
          }
        }
        const horCodigo = horarioPorDevice.get(idDevice);
        if (horCodigo == null) continue;
        for (const ARECodigo of areas) {
          aSemear.push({ INSInstituicaoCodigo: ins, HORCodigo: horCodigo, ARECodigo });
        }
      }
      if (aSemear.length) {
        const r = await tx.hRAHorarioArea.createMany({ data: aSemear, skipDuplicates: true });
        resumo.vinculosSemeados = r.count;
      }

      // ── departamentos já adotados ──────────────────────────────────────
      const adotados = await tx.dEQDepartamentoEquipamento.findMany({
        where: { INSInstituicaoCodigo: ins, EQPCodigo: eqpCodigo },
        select: { DEQCodigo: true, DEQIdDevice: true },
      });
      const grupoPorId = new Map(snapshot.grupos.map((g) => [g.id, g]));

      for (const deq of adotados) {
        const grupo = grupoPorId.get(deq.DEQIdDevice);
        if (grupo) {
          await tx.dEQDepartamentoEquipamento.update({
            where: { DEQCodigo: deq.DEQCodigo },
            data: { DEQNome: grupo.nome, DEQVerificadoEm: agora, DEQUltimoErro: null },
          });
        } else {
          // Departamento adotado sumiu do equipamento: nunca apagar em silêncio.
          await tx.dEQDepartamentoEquipamento.update({
            where: { DEQCodigo: deq.DEQCodigo },
            data: {
              DEQVerificadoEm: agora,
              DEQUltimoErro: 'Departamento não existe mais no equipamento',
            },
          });
          continue;
        }
        resumo.departamentos.adotados++;

        // Regras do grupo, agrupadas por horário. Uma access_rule com vários time_zones vira uma
        // DRG por horário, todas apontando para o mesmo id de regra no device.
        const doGrupo = permissoes.filter((r) => r.grupoIds.includes(deq.DEQIdDevice));
        const porHorario = new Map<string, { idRegra: string; nome: string; areas: Set<number>; regras: number }>();
        for (const regra of doGrupo) {
          if (!regra.horarioIds.length) {
            resumo.observacoes.regrasSemHorario++;
            continue;
          }
          for (const horarioId of regra.horarioIds) {
            const atual = porHorario.get(horarioId) ?? {
              idRegra: regra.id,
              nome: regra.nome,
              areas: new Set<number>(),
              regras: 0,
            };
            atual.regras++;
            for (const portalId of regra.portalIds) {
              const areaId = areaDoPortal.get(portalId);
              const codigo = areaId ? areaPorDevice.get(areaId) : undefined;
              if (codigo != null) atual.areas.add(codigo);
            }
            porHorario.set(horarioId, atual);
          }
        }

        const regrasAntes = await tx.dRGDepartamentoRegra.findMany({
          where: { DEQCodigo: deq.DEQCodigo },
          select: { DRGCodigo: true, HORCodigo: true },
        });
        const manter = new Set<number>();

        for (const [horarioId, dados] of porHorario) {
          if (dados.regras > 1) resumo.observacoes.regrasDuplicadas++;
          const horCodigo = horarioPorDevice.get(horarioId);
          if (horCodigo == null) continue;
          const drg = await tx.dRGDepartamentoRegra.upsert({
            where: { DEQCodigo_HORCodigo: { DEQCodigo: deq.DEQCodigo, HORCodigo: horCodigo } },
            create: {
              INSInstituicaoCodigo: ins,
              DEQCodigo: deq.DEQCodigo,
              HORCodigo: horCodigo,
              DRGIdRegraDevice: dados.idRegra,
              DRGNome: dados.nome,
            },
            update: { DRGIdRegraDevice: dados.idRegra, DRGNome: dados.nome },
            select: { DRGCodigo: true },
          });
          manter.add(drg.DRGCodigo);
          resumo.departamentos.regras++;

          await tx.dRADepartamentoRegraArea.deleteMany({
            where: { DRGCodigo: drg.DRGCodigo, ARECodigo: { notIn: [...dados.areas] } },
          });
          if (dados.areas.size) {
            await tx.dRADepartamentoRegraArea.createMany({
              data: [...dados.areas].map((ARECodigo) => ({
                INSInstituicaoCodigo: ins,
                DRGCodigo: drg.DRGCodigo,
                ARECodigo,
              })),
              skipDuplicates: true,
            });
          }
        }

        const obsoletas = regrasAntes.filter((r) => !manter.has(r.DRGCodigo)).map((r) => r.DRGCodigo);
        if (obsoletas.length) {
          await tx.dRGDepartamentoRegra.deleteMany({ where: { DRGCodigo: { in: obsoletas } } });
        }
      }

      const adotadosIds = new Set(adotados.map((d) => d.DEQIdDevice));
      resumo.gruposNaoAdotados = snapshot.grupos.filter((g) => !adotadosIds.has(g.id));
      resumo.observacoes.bloqueios = snapshot.regras.filter((r) => Number(r.tipo) === 0).length;
    },
    { timeout: TIMEOUT_TRANSACAO_MS },
  );

  return resumo;
}

/** Lê a configuração do equipamento e reconcilia o espelho. Não escreve nada na catraca. */
export async function lerEquipamento(
  prisma: PrismaClient,
  ins: number,
  hardware: Pick<AccessGroupPort, 'lerConfiguracao'>,
  eqp: EQPEquipamento,
): Promise<ResumoEspelho> {
  const snapshot = await hardware.lerConfiguracao(eqp);
  return aplicarSnapshot(prisma, ins, eqp.EQPCodigo, snapshot);
}
