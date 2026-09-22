// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/acesso-departamento.core.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { EQPEquipamento } from '@prisma/client';
import { aplicarSnapshot } from './espelho';
import { bytesUtf8, normalizarNomePerfil } from './perfil-nome';
import type { HardwareAccessSnapshot } from './ports';
import { TurmaAcessoErro, type Origem } from './tipos';
import type { ContextoAcesso } from './acesso-equipamento.core';

/**
 * Departamentos e suas regras num equipamento (fase 3 de
 * docs/controle-por-turma/PLANO-IMPLEMENTACAO.md).
 *
 * Uma regra do departamento = uma `access_rule` no equipamento:
 *
 *   groups ─group_access_rules─> access_rules ─portal_access_rules─> portals (um por área)
 *                                     └─access_rule_time_zones─> time_zones (o horário)
 *
 * É o encadeamento validado em bancada no §4 do runbook. O portal é quem carrega o sentido: uma
 * regra ligada só ao portal de entrada deixa a pessoa entrar e não sair (§6.1 da seção 1).
 */

const LOCK_TTL_MS = 5 * 60_000;
/** O firmware trunca nomes de `groups` em 15 bytes, como os de `time_zones`. */
const NOME_DEPARTAMENTO_MAX_BYTES = 15;

/** Uma regra desejada: um horário e as áreas em que ele vale neste departamento. */
export interface RegraDesejada {
  HORCodigo: number;
  /** Subconjunto das áreas do horário — por isso a regra tem áreas próprias, não herdadas. */
  ARECodigos: number[];
}

function exigirNome(nome: unknown): string {
  const n = normalizarNomePerfil(String(nome ?? ''));
  if (!n) throw new TurmaAcessoErro('Informe o nome do departamento', 'validacao');
  if (bytesUtf8(n) > NOME_DEPARTAMENTO_MAX_BYTES) {
    throw new TurmaAcessoErro(
      `Nome do departamento: máximo de ${NOME_DEPARTAMENTO_MAX_BYTES} caracteres (letras acentuadas contam como 2)`,
      'validacao',
    );
  }
  return n;
}

async function comLock<T>(ctx: ContextoAcesso, eqp: EQPEquipamento, fn: () => Promise<T>): Promise<T> {
  const r = await ctx.lock.comLock(ctx.chaveLock(ctx.ins, eqp.EQPCodigo), LOCK_TTL_MS, fn);
  if (r.ocupado) {
    throw new TurmaAcessoErro('Outro processo está alterando este equipamento. Tente em instantes.', 'conflito');
  }
  return r.valor;
}

async function exigirSuporte(ctx: ContextoAcesso, eqp: EQPEquipamento) {
  if (!eqp.EQPAtivo) throw new TurmaAcessoErro('Equipamento inativo', 'validacao');
  if (!(await ctx.hardware.suporta(eqp))) {
    throw new TurmaAcessoErro('Marca/modelo sem suporte a configuração de acesso (disponível para Control iD)', 'validacao');
  }
}

async function deqDoEquipamento(ctx: ContextoAcesso, eqp: EQPEquipamento, DEQCodigo: number) {
  const deq = await ctx.prisma.dEQDepartamentoEquipamento.findFirst({
    where: { DEQCodigo: Number(DEQCodigo), INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo },
    include: { departamento: true, regras: { include: { areas: true } } },
  });
  if (!deq) throw new TurmaAcessoErro('Departamento não encontrado neste equipamento', 'nao_encontrado');
  return deq;
}

// ── criar / renomear ───────────────────────────────────────────────────────

/**
 * Cria o departamento no equipamento e já o adota. O DEP da instituição é reaproveitado quando já
 * existe um com o mesmo nome — é ele que a turma vai apontar, atravessando as N catracas.
 */
export async function criarDepartamento(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  dados: { nome: string; DEPCodigo?: number },
  origem: Origem,
) {
  await exigirSuporte(ctx, eqp);
  const nome = exigirNome(dados.nome);

  let dep = dados.DEPCodigo
    ? await ctx.prisma.dEPDepartamento.findFirst({
        where: { DEPCodigo: Number(dados.DEPCodigo), INSInstituicaoCodigo: ctx.ins },
      })
    : await ctx.prisma.dEPDepartamento.findFirst({
        where: { INSInstituicaoCodigo: ctx.ins, DEPNome: { equals: nome, mode: 'insensitive' } },
      });
  if (dados.DEPCodigo && !dep) throw new TurmaAcessoErro('Departamento da instituição não encontrado', 'nao_encontrado');

  if (dep) {
    const jaNoEquipamento = await ctx.prisma.dEQDepartamentoEquipamento.findFirst({
      where: { DEPCodigo: dep.DEPCodigo, EQPCodigo: eqp.EQPCodigo },
    });
    if (jaNoEquipamento) {
      throw new TurmaAcessoErro(`O departamento "${dep.DEPNome}" já existe neste equipamento`, 'conflito');
    }
  }

  return comLock(ctx, eqp, async () => {
    const ops = await ctx.hardware.configOps(eqp);
    const idDevice = await ops.criarGrupo(nome);

    dep ??= await ctx.prisma.dEPDepartamento.create({
      data: { INSInstituicaoCodigo: ctx.ins, DEPNome: nome },
    });
    const deq = await ctx.prisma.dEQDepartamentoEquipamento.create({
      data: {
        INSInstituicaoCodigo: ctx.ins,
        DEPCodigo: dep.DEPCodigo,
        EQPCodigo: eqp.EQPCodigo,
        DEQIdDevice: idDevice,
        DEQNome: nome,
        // Criado aqui e agora por uma pessoa: já nasce revisado.
        DEQRevisadoEm: new Date(),
        ...(origem && 'usuario' in origem ? { USRCodigoRevisao: origem.usuario } : {}),
      },
    });
    await aplicarSnapshot(ctx.prisma, ctx.ins, eqp.EQPCodigo, await ctx.hardware.lerConfiguracao(eqp));
    return { DEQCodigo: deq.DEQCodigo, DEPCodigo: dep.DEPCodigo, DEQIdDevice: idDevice, nome };
  });
}

/**
 * Renomeia o grupo NO EQUIPAMENTO. O nome do departamento da instituição (`DEPNome`) não muda:
 * ele é compartilhado entre catracas e a turma aponta para ele.
 */
export async function renomearDepartamento(ctx: ContextoAcesso, eqp: EQPEquipamento, DEQCodigo: number, nome: string) {
  await exigirSuporte(ctx, eqp);
  const deq = await deqDoEquipamento(ctx, eqp, DEQCodigo);
  const n = exigirNome(nome);
  if (n === deq.DEQNome) return { DEQCodigo: deq.DEQCodigo, DEQNome: n };

  return comLock(ctx, eqp, async () => {
    const ops = await ctx.hardware.configOps(eqp);
    await ops.renomearGrupo(deq.DEQIdDevice, n);
    await aplicarSnapshot(ctx.prisma, ctx.ins, eqp.EQPCodigo, await ctx.hardware.lerConfiguracao(eqp));
    return { DEQCodigo: deq.DEQCodigo, DEQNome: n };
  });
}

/** Marca como conferido por uma pessoa. Enquanto não for, o sistema não propaga regra daqui. */
export async function revisarDepartamento(ctx: ContextoAcesso, eqp: EQPEquipamento, DEQCodigo: number, origem: Origem) {
  const deq = await deqDoEquipamento(ctx, eqp, DEQCodigo);
  await ctx.prisma.dEQDepartamentoEquipamento.update({
    where: { DEQCodigo: deq.DEQCodigo },
    data: {
      DEQRevisadoEm: new Date(),
      USRCodigoRevisao: origem && 'usuario' in origem ? origem.usuario : null,
    },
  });
  return { DEQCodigo: deq.DEQCodigo, revisado: true };
}

// ── regras ─────────────────────────────────────────────────────────────────

/**
 * Uma regra existente no equipamento só é reaproveitada quando tem exatamente a NOSSA forma: um
 * horário só e nenhum outro departamento. Reescrever uma regra com dois horários apagaria o
 * segundo; reescrever uma regra compartilhada mudaria quem passa em outro departamento — as duas
 * coisas em silêncio, que é a pior categoria de falha (README §6.3).
 */
export function reaproveitavel(
  snapshot: HardwareAccessSnapshot,
  regraId: string,
  grupoId: string,
  horarioId: string,
): boolean {
  const regra = snapshot.regras.find((r) => r.id === regraId);
  if (!regra || Number(regra.tipo) !== 1) return false;
  if (regra.horarioIds.length > 1) return false;
  if (regra.horarioIds.length === 1 && regra.horarioIds[0] !== horarioId) return false;
  return regra.grupoIds.every((g) => g === grupoId);
}

export interface ResultadoRegras {
  DEQCodigo: number;
  criadas: number;
  atualizadas: number;
  removidas: number;
  /** Regras do departamento no equipamento que não vieram daqui — reportadas, nunca apagadas. */
  desligadas: number;
  avisos: string[];
}

export async function salvarRegrasDepartamento(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  DEQCodigo: number,
  regras: RegraDesejada[],
): Promise<ResultadoRegras> {
  await exigirSuporte(ctx, eqp);
  const deq = await deqDoEquipamento(ctx, eqp, DEQCodigo);

  // ── validação contra o espelho ──
  const desejadas = new Map<number, number[]>();
  for (const r of regras ?? []) {
    const hor = Number(r?.HORCodigo);
    if (!Number.isInteger(hor)) throw new TurmaAcessoErro('Regra sem horário', 'validacao');
    if (desejadas.has(hor)) {
      throw new TurmaAcessoErro('O mesmo horário aparece duas vezes: junte as áreas numa regra só', 'validacao');
    }
    desejadas.set(hor, [...new Set((r.ARECodigos ?? []).map(Number).filter(Number.isInteger))]);
  }

  const [horarios, portais] = await Promise.all([
    ctx.prisma.hORHorario.findMany({
      where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo, HORCodigo: { in: [...desejadas.keys()] } },
    }),
    ctx.prisma.pTLPortal.findMany({ where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo } }),
  ]);
  if (horarios.length !== desejadas.size) {
    const achados = new Set(horarios.map((h) => h.HORCodigo));
    throw new TurmaAcessoErro('Horário não encontrado neste equipamento', 'nao_encontrado', {
      HORCodigos: [...desejadas.keys()].filter((h) => !achados.has(h)),
    });
  }

  // Liberar a ENTRADA numa área é ligar a regra ao portal cuja área de destino é ela.
  const portalDaArea = new Map<number, string>();
  for (const p of portais) {
    if (p.PTLAreaParaCodigo != null && !portalDaArea.has(p.PTLAreaParaCodigo)) {
      portalDaArea.set(p.PTLAreaParaCodigo, p.PTLIdDevice);
    }
  }
  const areasSemPortal = [...new Set([...desejadas.values()].flat())].filter((a) => !portalDaArea.has(a));
  if (areasSemPortal.length) {
    const nomes = await ctx.prisma.aREArea.findMany({
      where: { ARECodigo: { in: areasSemPortal } },
      select: { ARENome: true },
    });
    throw new TurmaAcessoErro(
      `Sem portal de entrada para ${nomes.map((n) => `"${n.ARENome}"`).join(', ')}. ` +
        'Crie o portal na aba Áreas antes — sem ele a regra não libera sentido nenhum.',
      'validacao',
      { ARECodigos: areasSemPortal },
    );
  }

  const horarioPorCodigo = new Map(horarios.map((h) => [h.HORCodigo, h]));
  const resultado: ResultadoRegras = {
    DEQCodigo: deq.DEQCodigo,
    criadas: 0,
    atualizadas: 0,
    removidas: 0,
    desligadas: 0,
    avisos: [],
  };

  return comLock(ctx, eqp, async () => {
    const snapshot = await ctx.hardware.lerConfiguracao(eqp);
    if (!snapshot.grupos.some((g) => g.id === deq.DEQIdDevice)) {
      throw new TurmaAcessoErro(
        `O departamento "${deq.DEQNome}" não existe mais no equipamento (id ${deq.DEQIdDevice})`,
        'nao_encontrado',
      );
    }
    const ops = await ctx.hardware.configOps(eqp);
    const anteriores = new Map(deq.regras.map((r) => [r.HORCodigo, r]));
    const idsUsados = new Set<string>();

    for (const [horCodigo, areCodigos] of desejadas) {
      const horario = horarioPorCodigo.get(horCodigo)!;
      const nomeRegra = `SchoolGuard ${deq.DEQNome} - ${horario.HORNome}`;
      const anterior = anteriores.get(horCodigo);

      let regraId = anterior?.DRGIdRegraDevice ?? null;
      if (regraId && !reaproveitavel(snapshot, regraId, deq.DEQIdDevice, horario.HORIdDevice)) {
        // Existe, mas não é nossa forma: desliga do departamento e cria uma limpa.
        await ops.desligarRegraDoGrupo(deq.DEQIdDevice, regraId);
        resultado.avisos.push(
          `A regra #${regraId} do horário "${horario.HORNome}" tinha outros horários ou outros departamentos; ` +
            'foi desligada deste departamento e substituída por uma regra nova.',
        );
        regraId = null;
      }

      if (regraId) {
        await ops.renomearRegra(regraId, nomeRegra);
        resultado.atualizadas++;
      } else {
        regraId = await ops.criarRegra(nomeRegra);
        resultado.criadas++;
      }
      idsUsados.add(regraId);

      await ops.definirHorariosDaRegra(regraId, [horario.HORIdDevice]);
      await ops.definirPortaisDaRegra(regraId, areCodigos.map((a) => portalDaArea.get(a)!));
      await ops.ligarRegraAoGrupo(deq.DEQIdDevice, regraId);
    }

    // Regras que saíram da lista.
    for (const [horCodigo, anterior] of anteriores) {
      if (desejadas.has(horCodigo) || !anterior.DRGIdRegraDevice) continue;
      const id = anterior.DRGIdRegraDevice;
      if (idsUsados.has(id)) continue;

      const noDevice = snapshot.regras.find((r) => r.id === id);
      const compartilhada = !!noDevice && noDevice.grupoIds.some((g) => g !== deq.DEQIdDevice);
      if (compartilhada) {
        // Apagar mudaria quem passa em outro departamento: só desfaz o vínculo com este.
        await ops.desligarRegraDoGrupo(deq.DEQIdDevice, id);
        resultado.desligadas++;
        resultado.avisos.push(`A regra #${id} também serve a outro departamento; foi apenas desligada deste.`);
      } else {
        await ops.removerRegra(id);
        resultado.removidas++;
      }
    }

    // O espelho é reconstruído a partir do que o equipamento passou a ter, não do que pedimos.
    await aplicarSnapshot(ctx.prisma, ctx.ins, eqp.EQPCodigo, await ctx.hardware.lerConfiguracao(eqp));
    return resultado;
  });
}

// ── adoção ─────────────────────────────────────────────────────────────────

/** Comparação de nome tolerante a acento, caixa e espaço — só para SUGERIR, nunca para vincular. */
const normNome = (v: string) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export type FormaRegra = 'nossa' | 'multiplos_horarios' | 'compartilhada' | 'sem_horario';

/**
 * Como o modelo enxerga uma regra que já estava no equipamento. Só 'nossa' pode ser editada em
 * cima; as demais são substituídas por regras novas quando o departamento for salvo, porque
 * reescrevê-las apagaria um horário ou mudaria quem passa em outro departamento.
 */
export function formaDaRegra(
  regra: { horarioIds: string[]; grupoIds: string[] },
  grupoId: string,
): FormaRegra {
  if (!regra.horarioIds.length) return 'sem_horario';
  if (regra.horarioIds.length > 1) return 'multiplos_horarios';
  if (regra.grupoIds.some((g) => g !== grupoId)) return 'compartilhada';
  return 'nossa';
}

export interface CandidatoDepartamento {
  /** id de `groups` no equipamento. É por ele que a adoção vincula, não pelo nome. */
  DEQIdDevice: string;
  nome: string;
  /** Regras de permissão que o grupo JÁ tem no equipamento, como o modelo as lê. */
  regras: Array<{
    idRegra: string;
    nomeRegra: string;
    horarios: Array<{ HORCodigo: number | null; idDevice: string; nome: string }>;
    areas: Array<{ ARECodigo: number | null; nome: string }>;
    /** Regra que o modelo não representa: mais de um horário, ou compartilhada. */
    forma: FormaRegra;
  }>;
  /** DEP da instituição com o mesmo nome, se houver. Sugestão — quem decide é a pessoa. */
  DEPSugerido: { DEPCodigo: number; DEPNome: string } | null;
  /** Já existe outro grupo deste equipamento adotado no DEP sugerido. */
  sugestaoOcupada: boolean;
}

/**
 * Grupos do equipamento ainda sem adoção, com o que cada um já libera.
 *
 * Lê do equipamento, não do espelho: o espelho só guarda departamentos adotados, e o objetivo aqui
 * é justamente encontrar o que foi criado por fora — pela interface web da catraca, por exemplo.
 */
export async function candidatosDepartamento(ctx: ContextoAcesso, eqp: EQPEquipamento): Promise<{
  candidatos: CandidatoDepartamento[];
  departamentos: Array<{ DEPCodigo: number; DEPNome: string; adotadoAqui: boolean }>;
}> {
  await exigirSuporte(ctx, eqp);

  const snapshot = await ctx.hardware.lerConfiguracao(eqp).catch((err) => {
    throw new TurmaAcessoErro(`Não foi possível ler o equipamento: ${String(err?.message ?? err)}`, 'equipamento');
  });

  const [adotados, deps, areas, horarios] = await Promise.all([
    ctx.prisma.dEQDepartamentoEquipamento.findMany({
      where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo },
      select: { DEQIdDevice: true, DEPCodigo: true },
    }),
    ctx.prisma.dEPDepartamento.findMany({
      where: { INSInstituicaoCodigo: ctx.ins },
      orderBy: { DEPNome: 'asc' },
    }),
    ctx.prisma.aREArea.findMany({ where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo } }),
    ctx.prisma.hORHorario.findMany({ where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo } }),
  ]);

  const idsAdotados = new Set(adotados.map((a) => a.DEQIdDevice));
  const depsOcupados = new Set(adotados.map((a) => a.DEPCodigo));
  const depPorNome = new Map(deps.map((d) => [normNome(d.DEPNome), d]));
  const areaPorDevice = new Map(areas.map((a) => [a.AREIdDevice, a]));
  const horarioPorDevice = new Map(horarios.map((h) => [h.HORIdDevice, h]));
  const areaDoPortal = new Map(snapshot.portais.map((p) => [p.id, p.areaToId]));

  const candidatos = snapshot.grupos
    .filter((g) => !idsAdotados.has(g.id))
    .map((g): CandidatoDepartamento => {
      const regras = snapshot.regras
        .filter((r) => r.grupoIds.includes(g.id) && Number(r.tipo) === 1)
        .map((r) => {
          const forma = formaDaRegra(r, g.id);
          return {
            idRegra: r.id,
            nomeRegra: r.nome,
            horarios: r.horarioIds.map((id) => ({
              HORCodigo: horarioPorDevice.get(id)?.HORCodigo ?? null,
              idDevice: id,
              nome: snapshot.horarios.find((h) => h.id === id)?.nome ?? `#${id}`,
            })),
            areas: r.portalIds.map((pid) => {
              const areaId = areaDoPortal.get(pid);
              const area = areaId ? areaPorDevice.get(areaId) : undefined;
              return {
                ARECodigo: area?.ARECodigo ?? null,
                nome: area?.ARENome ?? snapshot.areas.find((a) => a.id === areaId)?.nome ?? `portal #${pid}`,
              };
            }),
            forma,
          };
        });

      const sugerido = depPorNome.get(normNome(g.nome)) ?? null;
      return {
        DEQIdDevice: g.id,
        nome: g.nome,
        regras,
        DEPSugerido: sugerido ? { DEPCodigo: sugerido.DEPCodigo, DEPNome: sugerido.DEPNome } : null,
        sugestaoOcupada: !!sugerido && depsOcupados.has(sugerido.DEPCodigo),
      };
    });

  return {
    candidatos,
    departamentos: deps.map((d) => ({
      DEPCodigo: d.DEPCodigo,
      DEPNome: d.DEPNome,
      adotadoAqui: depsOcupados.has(d.DEPCodigo),
    })),
  };
}

/**
 * Adota um grupo que já existe no equipamento. Não escreve nada na catraca: só cria o vínculo e
 * reconcilia o espelho, que passa a enxergar as regras que o grupo já tinha.
 *
 * Nasce `DEQRevisadoEm = null`: a configuração veio de fora e precisa de alguém conferir antes de
 * o sistema propagar qualquer regra para este equipamento.
 */
export async function adotarDepartamento(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  dados: { DEQIdDevice: string; DEPCodigo?: number; DEPNome?: string },
) {
  await exigirSuporte(ctx, eqp);
  const idDevice = String(dados.DEQIdDevice ?? '').trim();
  if (!idDevice) throw new TurmaAcessoErro('Informe o departamento do equipamento a adotar', 'validacao');

  const snapshot = await ctx.hardware.lerConfiguracao(eqp);
  const grupo = snapshot.grupos.find((g) => g.id === idDevice);
  if (!grupo) throw new TurmaAcessoErro(`Departamento #${idDevice} não existe no equipamento`, 'nao_encontrado');

  const jaAdotado = await ctx.prisma.dEQDepartamentoEquipamento.findFirst({
    where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo, DEQIdDevice: idDevice },
    include: { departamento: { select: { DEPNome: true } } },
  });
  if (jaAdotado) {
    throw new TurmaAcessoErro(`Este departamento já está adotado como "${jaAdotado.departamento.DEPNome}"`, 'conflito');
  }

  let dep = dados.DEPCodigo
    ? await ctx.prisma.dEPDepartamento.findFirst({
        where: { DEPCodigo: Number(dados.DEPCodigo), INSInstituicaoCodigo: ctx.ins },
      })
    : null;
  if (dados.DEPCodigo && !dep) throw new TurmaAcessoErro('Departamento da instituição não encontrado', 'nao_encontrado');

  if (!dep) {
    const nome = normalizarNomePerfil(dados.DEPNome ?? grupo.nome);
    if (!nome) throw new TurmaAcessoErro('Informe o nome do departamento da instituição', 'validacao');
    dep =
      (await ctx.prisma.dEPDepartamento.findFirst({
        where: { INSInstituicaoCodigo: ctx.ins, DEPNome: { equals: nome, mode: 'insensitive' } },
      })) ??
      (await ctx.prisma.dEPDepartamento.create({ data: { INSInstituicaoCodigo: ctx.ins, DEPNome: nome } }));
  }

  const ocupado = await ctx.prisma.dEQDepartamentoEquipamento.findFirst({
    where: { DEPCodigo: dep.DEPCodigo, EQPCodigo: eqp.EQPCodigo },
  });
  if (ocupado) {
    throw new TurmaAcessoErro(
      `O departamento "${dep.DEPNome}" já está vinculado ao grupo #${ocupado.DEQIdDevice} neste equipamento`,
      'conflito',
    );
  }

  const deq = await ctx.prisma.dEQDepartamentoEquipamento.create({
    data: {
      INSInstituicaoCodigo: ctx.ins,
      DEPCodigo: dep.DEPCodigo,
      EQPCodigo: eqp.EQPCodigo,
      DEQIdDevice: idDevice,
      DEQNome: grupo.nome,
      DEQRevisadoEm: null,
    },
  });
  await aplicarSnapshot(ctx.prisma, ctx.ins, eqp.EQPCodigo, snapshot);
  return { DEQCodigo: deq.DEQCodigo, DEPCodigo: dep.DEPCodigo, DEPNome: dep.DEPNome, DEQNome: grupo.nome };
}

/**
 * Desfaz a adoção. O grupo e as regras continuam intactos no equipamento — desadotar é dizer "o
 * projeto não gerencia isto", não "apague".
 *
 * FASE 5: quando `TRMTurma.DEPCodigo` existir, barrar aqui o DEP que ainda tem turma apontando
 * para ele. Hoje nada aponta, então não há o que checar.
 */
export async function desadotarDepartamento(ctx: ContextoAcesso, eqp: EQPEquipamento, DEQCodigo: number) {
  const deq = await deqDoEquipamento(ctx, eqp, DEQCodigo);

  const outrosEquipamentos = await ctx.prisma.dEQDepartamentoEquipamento.count({
    where: { DEPCodigo: deq.DEPCodigo, DEQCodigo: { not: deq.DEQCodigo } },
  });
  await ctx.prisma.dEQDepartamentoEquipamento.delete({ where: { DEQCodigo: deq.DEQCodigo } });
  // DEP sem nenhuma adoção e sem uso vira lixo; some junto.
  if (!outrosEquipamentos) {
    await ctx.prisma.dEPDepartamento
      .delete({ where: { DEPCodigo: deq.DEPCodigo } })
      .catch(() => undefined);
  }
  return { DEQCodigo: deq.DEQCodigo, desadotado: true, DEPRemovido: !outrosEquipamentos };
}
