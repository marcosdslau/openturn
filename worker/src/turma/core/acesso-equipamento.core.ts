// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/acesso-equipamento.core.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { EQPEquipamento, PrismaClient } from '@prisma/client';
import { aplicarSnapshot } from './espelho';
import { minutos, validarJanelas } from './perfil-canonico';
import { bytesUtf8, normalizarNomePerfil } from './perfil-nome';
import type { AccessGroupPort, HardwareSpanEntrada, LockPort } from './ports';
import { TurmaAcessoErro, type JanelaEntrada } from './tipos';

/**
 * Escrita na configuração de acesso de um equipamento: áreas, portais e horários
 * (fase 2 de docs/controle-por-turma/PLANO-IMPLEMENTACAO.md).
 *
 * Toda operação faz três coisas, nesta ordem e sob o lock do equipamento:
 *   1. valida contra o espelho;
 *   2. escreve no equipamento;
 *   3. RELÊ o equipamento inteiro e reconcilia o espelho.
 *
 * O passo 3 é o que mantém o modelo honesto: o equipamento não valida semântica e aceita em
 * silêncio o que não devia (README §6.3), então o que vale é o que voltou da leitura — nunca o
 * que achamos que gravamos.
 *
 * Departamentos e regras NÃO entram aqui: são a fase 3.
 */

const LOCK_TTL_MS = 5 * 60_000;
/** O firmware trunca nomes de `time_zones` em 15 bytes (mesmo limite dos perfis). */
const NOME_HORARIO_MAX_BYTES = 15;
/** Limite conservador: o firmware não documenta o máximo de `areas`/`portals`. */
const NOME_AREA_MAX_BYTES = 30;
/** Segundo 86399 é o "fim do dia" do firmware — 86400 não existe. */
const FIM_DO_DIA = 86399;

export interface JanelaDevice extends JanelaEntrada {
  /** hol1..hol3 */
  feriados?: boolean[];
}

export interface ContextoAcesso {
  prisma: PrismaClient;
  ins: number;
  hardware: Pick<AccessGroupPort, 'suporta' | 'lerConfiguracao' | 'configOps'>;
  lock: LockPort;
  chaveLock: (ins: number, eqpCodigo: number) => string;
}

function exigirNome(nome: unknown, max: number, oque: string): string {
  const n = normalizarNomePerfil(String(nome ?? ''));
  if (!n) throw new TurmaAcessoErro(`Informe o nome ${oque}`, 'validacao');
  if (bytesUtf8(n) > max) {
    throw new TurmaAcessoErro(
      `Nome ${oque}: máximo de ${max} caracteres (letras acentuadas contam como 2)`,
      'validacao',
    );
  }
  return n;
}

/**
 * Faixas digitadas → intervalos do equipamento. Faixa que cruza a meia-noite vira dois spans: até
 * o fim do dia no dia marcado, e a sobra no dia seguinte — o firmware não aceita `end < start`.
 */
export function paraSpans(janelas: JanelaDevice[]): HardwareSpanEntrada[] {
  const spans: HardwareSpanEntrada[] = [];
  for (const j of janelas) {
    const ini = minutos(j.inicio) * 60;
    const fim = Math.min(minutos(j.fim) * 60, FIM_DO_DIA);
    const feriados = j.feriados ? [...j.feriados] : undefined;
    if (fim > ini) {
      spans.push({ start: ini, end: fim, dias: [...j.dias], feriados });
      continue;
    }
    spans.push({ start: ini, end: FIM_DO_DIA, dias: [...j.dias], feriados });
    if (fim > 0) {
      const diaSeguinte = [0, 1, 2, 3, 4, 5, 6].map((d) => !!j.dias[(d + 6) % 7]);
      spans.push({ start: 0, end: fim, dias: diaSeguinte, feriados });
    }
  }
  return spans;
}

async function comLock<T>(ctx: ContextoAcesso, eqp: EQPEquipamento, fn: () => Promise<T>): Promise<T> {
  const r = await ctx.lock.comLock(ctx.chaveLock(ctx.ins, eqp.EQPCodigo), LOCK_TTL_MS, fn);
  if (r.ocupado) {
    throw new TurmaAcessoErro('Outro processo está alterando este equipamento. Tente em instantes.', 'conflito');
  }
  return r.valor;
}

/** Relê o equipamento e reconcilia o espelho. Chamado depois de toda escrita. */
async function reconciliar(ctx: ContextoAcesso, eqp: EQPEquipamento) {
  return aplicarSnapshot(ctx.prisma, ctx.ins, eqp.EQPCodigo, await ctx.hardware.lerConfiguracao(eqp));
}

async function exigirSuporte(ctx: ContextoAcesso, eqp: EQPEquipamento) {
  if (!eqp.EQPAtivo) throw new TurmaAcessoErro('Equipamento inativo', 'validacao');
  if (!(await ctx.hardware.suporta(eqp))) {
    throw new TurmaAcessoErro('Marca/modelo sem suporte a configuração de acesso (disponível para Control iD)', 'validacao');
  }
}

async function areaDoEquipamento(ctx: ContextoAcesso, eqp: EQPEquipamento, ARECodigo: number) {
  const area = await ctx.prisma.aREArea.findFirst({
    where: { ARECodigo: Number(ARECodigo), INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo },
  });
  if (!area) throw new TurmaAcessoErro('Área não encontrada neste equipamento', 'nao_encontrado');
  return area;
}

async function horarioDoEquipamento(ctx: ContextoAcesso, eqp: EQPEquipamento, HORCodigo: number) {
  const horario = await ctx.prisma.hORHorario.findFirst({
    where: { HORCodigo: Number(HORCodigo), INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo },
  });
  if (!horario) throw new TurmaAcessoErro('Horário não encontrado neste equipamento', 'nao_encontrado');
  return horario;
}

/** Áreas informadas existem neste equipamento? Devolve os códigos sem repetição. */
async function validarAreas(ctx: ContextoAcesso, eqp: EQPEquipamento, ARECodigos: number[] | undefined) {
  const codigos = [...new Set((ARECodigos ?? []).map(Number).filter(Number.isInteger))];
  if (!codigos.length) return [];
  const achadas = await ctx.prisma.aREArea.findMany({
    where: { ARECodigo: { in: codigos }, INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo },
    select: { ARECodigo: true },
  });
  if (achadas.length !== codigos.length) {
    const vistas = new Set(achadas.map((a) => a.ARECodigo));
    throw new TurmaAcessoErro('Área não encontrada neste equipamento', 'nao_encontrado', {
      ARECodigos: codigos.filter((c) => !vistas.has(c)),
    });
  }
  return codigos;
}

function exigirJanelas(janelas: JanelaDevice[] | undefined) {
  const lista = janelas ?? [];
  const erros = validarJanelas(lista);
  if (erros.length) throw new TurmaAcessoErro(`Faixas inválidas: ${erros.join('; ')}`, 'validacao', { erros });
  return lista;
}

async function nomeLivre(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  tabela: 'area' | 'horario',
  nome: string,
  ignorarCodigo?: number,
) {
  const iguais =
    tabela === 'area'
      ? await ctx.prisma.aREArea.findMany({
          where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo, ARENome: { equals: nome, mode: 'insensitive' } },
          select: { ARECodigo: true },
        })
      : await ctx.prisma.hORHorario.findMany({
          where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo, HORNome: { equals: nome, mode: 'insensitive' } },
          select: { HORCodigo: true },
        });
  const conflita = iguais.some((l) => ('ARECodigo' in l ? l.ARECodigo : l.HORCodigo) !== ignorarCodigo);
  if (conflita) {
    throw new TurmaAcessoErro(`Já existe ${tabela === 'area' ? 'uma área' : 'um horário'} "${nome}" neste equipamento`, 'conflito');
  }
}

// ── áreas ──────────────────────────────────────────────────────────────────

export async function criarArea(ctx: ContextoAcesso, eqp: EQPEquipamento, nome: string) {
  await exigirSuporte(ctx, eqp);
  const n = exigirNome(nome, NOME_AREA_MAX_BYTES, 'da área');
  await nomeLivre(ctx, eqp, 'area', n);

  return comLock(ctx, eqp, async () => {
    const ops = await ctx.hardware.configOps(eqp);
    const idDevice = await ops.criarArea(n);
    await reconciliar(ctx, eqp);
    const area = await ctx.prisma.aREArea.findFirst({
      where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo, AREIdDevice: idDevice },
    });
    return { ARECodigo: area?.ARECodigo ?? null, AREIdDevice: idDevice, ARENome: n };
  });
}

export async function renomearArea(ctx: ContextoAcesso, eqp: EQPEquipamento, ARECodigo: number, nome: string) {
  await exigirSuporte(ctx, eqp);
  const area = await areaDoEquipamento(ctx, eqp, ARECodigo);
  const n = exigirNome(nome, NOME_AREA_MAX_BYTES, 'da área');
  if (n === area.ARENome) return { ARECodigo: area.ARECodigo, ARENome: area.ARENome };
  await nomeLivre(ctx, eqp, 'area', n, area.ARECodigo);

  return comLock(ctx, eqp, async () => {
    const ops = await ctx.hardware.configOps(eqp);
    await ops.renomearArea(area.AREIdDevice, n);
    await reconciliar(ctx, eqp);
    return { ARECodigo: area.ARECodigo, ARENome: n };
  });
}

// ── portais ────────────────────────────────────────────────────────────────

/**
 * Departamentos adotados que NÃO têm nenhuma regra liberando a entrada nesta área.
 *
 * Um portal recém-criado não carrega regra nenhuma: ninguém passa por ele até algum departamento
 * ganhar uma regra cobrindo a área de destino. No fluxo antigo o `prepareDirection` replicava as
 * regras gerais nos portais novos para evitar isso; o modelo novo não replica nada em silêncio —
 * ele DIZ quem ficou de fora, e a decisão é de quem configura. Entrar e ficar preso do lado de
 * dentro é o modo de falha que originou este trabalho (docs/controle-por-turma/README.md §6.1).
 */
export async function departamentosSemRegraNaArea(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  ARECodigo: number,
): Promise<Array<{ DEQCodigo: number; nome: string }>> {
  const adotados = await ctx.prisma.dEQDepartamentoEquipamento.findMany({
    where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo },
    select: { DEQCodigo: true, DEQNome: true, regras: { select: { areas: { select: { ARECodigo: true } } } } },
    orderBy: { DEQNome: 'asc' },
  });
  return adotados
    .filter((d) => !d.regras.some((r) => r.areas.some((a) => a.ARECodigo === ARECodigo)))
    .map((d) => ({ DEQCodigo: d.DEQCodigo, nome: d.DEQNome }));
}

/**
 * Cria o portal `de → para`. O nome padrão diz o que o portal faz — quem passa por ele ENTRA na
 * área de destino —, porque nome e sentido divergentes já custaram um dia de depuração (README §8.2).
 */
export async function criarPortal(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  dados: { areaDeCodigo: number; areaParaCodigo: number; nome?: string },
) {
  await exigirSuporte(ctx, eqp);
  const de = await areaDoEquipamento(ctx, eqp, dados.areaDeCodigo);
  const para = await areaDoEquipamento(ctx, eqp, dados.areaParaCodigo);
  if (de.ARECodigo === para.ARECodigo) {
    throw new TurmaAcessoErro('O portal precisa ligar duas áreas diferentes', 'validacao');
  }

  const jaExiste = await ctx.prisma.pTLPortal.findFirst({
    where: {
      INSInstituicaoCodigo: ctx.ins,
      EQPCodigo: eqp.EQPCodigo,
      PTLAreaDeCodigo: de.ARECodigo,
      PTLAreaParaCodigo: para.ARECodigo,
    },
  });
  if (jaExiste) {
    throw new TurmaAcessoErro(`Já existe um portal de "${de.ARENome}" para "${para.ARENome}" neste equipamento`, 'conflito');
  }

  const n = exigirNome(dados.nome ?? `Entrada ${para.ARENome}`, NOME_AREA_MAX_BYTES, 'do portal');

  return comLock(ctx, eqp, async () => {
    const ops = await ctx.hardware.configOps(eqp);
    const idDevice = await ops.criarPortal(n, de.AREIdDevice, para.AREIdDevice);
    await reconciliar(ctx, eqp);
    const portal = await ctx.prisma.pTLPortal.findFirst({
      where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo, PTLIdDevice: idDevice },
    });
    return {
      PTLCodigo: portal?.PTLCodigo ?? null,
      PTLIdDevice: idDevice,
      PTLNome: n,
      // Quem NÃO passa por este portal enquanto ninguém configurar uma regra para a área de destino.
      departamentosSemRegra: await departamentosSemRegraNaArea(ctx, eqp, para.ARECodigo),
    };
  });
}

// ── horários ───────────────────────────────────────────────────────────────

/** Grava o vínculo horário ↔ área. É configuração nossa: não existe no equipamento. */
async function definirAreas(ctx: ContextoAcesso, HORCodigo: number, ARECodigos: number[]) {
  await ctx.prisma.hRAHorarioArea.deleteMany({ where: { HORCodigo, ARECodigo: { notIn: ARECodigos } } });
  if (ARECodigos.length) {
    await ctx.prisma.hRAHorarioArea.createMany({
      data: ARECodigos.map((ARECodigo) => ({ INSInstituicaoCodigo: ctx.ins, HORCodigo, ARECodigo })),
      skipDuplicates: true,
    });
  }
}

export async function criarHorario(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  dados: { nome: string; janelas: JanelaDevice[]; ARECodigos?: number[] },
) {
  await exigirSuporte(ctx, eqp);
  const n = exigirNome(dados.nome, NOME_HORARIO_MAX_BYTES, 'do horário');
  await nomeLivre(ctx, eqp, 'horario', n);
  const janelas = exigirJanelas(dados.janelas);
  const areas = await validarAreas(ctx, eqp, dados.ARECodigos);

  return comLock(ctx, eqp, async () => {
    const ops = await ctx.hardware.configOps(eqp);
    const idDevice = await ops.criarHorario(n);
    await ops.substituirIntervalos(idDevice, paraSpans(janelas));
    await reconciliar(ctx, eqp);

    const horario = await ctx.prisma.hORHorario.findFirst({
      where: { INSInstituicaoCodigo: ctx.ins, EQPCodigo: eqp.EQPCodigo, HORIdDevice: idDevice },
    });
    if (horario) await definirAreas(ctx, horario.HORCodigo, areas);
    return { HORCodigo: horario?.HORCodigo ?? null, HORIdDevice: idDevice, HORNome: n };
  });
}

export async function atualizarHorario(
  ctx: ContextoAcesso,
  eqp: EQPEquipamento,
  HORCodigo: number,
  dados: { nome?: string; janelas?: JanelaDevice[]; ARECodigos?: number[] },
) {
  await exigirSuporte(ctx, eqp);
  const horario = await horarioDoEquipamento(ctx, eqp, HORCodigo);

  const nome = dados.nome === undefined ? null : exigirNome(dados.nome, NOME_HORARIO_MAX_BYTES, 'do horário');
  if (nome && nome !== horario.HORNome) await nomeLivre(ctx, eqp, 'horario', nome, horario.HORCodigo);
  const janelas = dados.janelas === undefined ? null : exigirJanelas(dados.janelas);
  const areas = dados.ARECodigos === undefined ? null : await validarAreas(ctx, eqp, dados.ARECodigos);

  const mexeNoDevice = (nome != null && nome !== horario.HORNome) || janelas != null;
  // Só o vínculo com áreas mudou: é dado nosso, não precisa falar com o equipamento.
  if (!mexeNoDevice) {
    if (areas) await definirAreas(ctx, horario.HORCodigo, areas);
    return { HORCodigo: horario.HORCodigo, HORNome: horario.HORNome };
  }

  return comLock(ctx, eqp, async () => {
    const ops = await ctx.hardware.configOps(eqp);
    if (nome != null && nome !== horario.HORNome) await ops.renomearHorario(horario.HORIdDevice, nome);
    if (janelas != null) await ops.substituirIntervalos(horario.HORIdDevice, paraSpans(janelas));
    await reconciliar(ctx, eqp);
    if (areas) await definirAreas(ctx, horario.HORCodigo, areas);
    return { HORCodigo: horario.HORCodigo, HORNome: nome ?? horario.HORNome };
  });
}

export async function removerHorario(ctx: ContextoAcesso, eqp: EQPEquipamento, HORCodigo: number) {
  await exigirSuporte(ctx, eqp);
  const horario = await horarioDoEquipamento(ctx, eqp, HORCodigo);

  return comLock(ctx, eqp, async () => {
    // Quem manda é o equipamento, não o espelho: uma regra criada pela interface web da catraca
    // não está no espelho e mesmo assim faria a remoção falhar com FOREIGN KEY (README §6.2).
    const snapshot = await ctx.hardware.lerConfiguracao(eqp);
    const emUso = snapshot.regras.filter((r) => r.horarioIds.includes(horario.HORIdDevice));
    if (emUso.length) {
      throw new TurmaAcessoErro(
        `O horário "${horario.HORNome}" está em uso por ${emUso.length} regra(s) no equipamento: ` +
          `${emUso.map((r) => r.nome || `#${r.id}`).join(', ')}. Remova a regra antes.`,
        'conflito',
        { regras: emUso.map((r) => ({ id: r.id, nome: r.nome })) },
      );
    }

    const ops = await ctx.hardware.configOps(eqp);
    await ops.removerHorario(horario.HORIdDevice);
    await reconciliar(ctx, eqp);
    return { HORCodigo: horario.HORCodigo, removido: true };
  });
}
