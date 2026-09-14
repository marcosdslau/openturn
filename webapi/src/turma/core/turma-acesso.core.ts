import type { EQPEquipamento, PHAPerfilHorario, PHEPerfilEquipamento, Prisma, PrismaClient } from '@prisma/client';
import {
  chaveCorrespondenciaAnual,
  diferencaSimetrica,
  elegerTurma,
  hashDesejado,
  paraTurmaEstado,
  perfilDeveExistir,
  resolverEscopo,
  resolverTurmaDaMatricula,
  type TurmaEstado,
} from './estado-desejado';
import { resolverGruposDaPessoa } from './grupo-pessoa';
import { hashEstavel } from './hash-estavel';
import {
  canonizar,
  hashConfig,
  hashJanelas,
  janelaParaLinha,
  linhaParaJanela,
  validarJanelas,
  type Canonico,
} from './perfil-canonico';
import { normalizarNomePerfil, sugerirNomePerfil, validarNomePerfil } from './perfil-nome';
import type { AccessGroupPort, HardwareAccessGroupRef, LockPort } from './ports';
import {
  TurmaAcessoErro,
  type CatalogoEntrada,
  type EscopoEntrada,
  type JanelaEntrada,
  type Origem,
  type ResultadoEquipamento,
  type StatusEquipamento,
  type ValidacaoEntrada,
} from './tipos';

const LOCK_TTL_MS = 5 * 60_000;
const TIMEOUT_TRANSACAO_MS = 60_000;

export interface TurmaAcessoCoreOpcoes {
  hardware: AccessGroupPort;
  lock: LockPort;
  /** Chave Redis do lock por equipamento (cada lado aplica o próprio prefixo de ambiente). */
  chaveLock: (instituicaoCodigo: number, eqpCodigo: number) => string;
  log?: (nivel: 'info' | 'warn' | 'error', mensagem: string) => void;
}

export interface FiltroTurmas {
  page?: number;
  limit?: number;
  ano?: string;
  curso?: string;
  serie?: string;
  turno?: string;
  perfil?: number;
  equipamento?: number;
  validacaoAtiva?: boolean;
  /** Padrão: só turmas ativas. `'todas'` inclui as que saíram da origem. */
  ativa?: boolean | 'todas';
  busca?: string;
}

export interface ParImportacao {
  TRMCodigoOrigem: number;
  TRMCodigoDestino: number;
}

type PerfilParaSync = PHAPerfilHorario & { janelas: Prisma.PHAJanelaGetPayload<object>[]; equipamentos: PHEPerfilEquipamento[] };

function mensagemDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function violouUnique(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002';
}

function inteiros(valores: unknown[] | undefined): number[] {
  return [...new Set((valores ?? []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
}

function rotuloTurma(t: {
  TRMSerie: string | null;
  TRMTurma: string;
  TRMTurno: string | null;
  TRMAnoReferencia: string | null;
}): string {
  const base = [t.TRMSerie, t.TRMTurma].filter(Boolean).join(' ');
  const extras = [t.TRMTurno, t.TRMAnoReferencia].filter(Boolean).join(' · ');
  return extras ? `${base} — ${extras}` : base;
}

function paraData(v: string | Date | null | undefined): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Todas as operações de negócio do controle de acesso por turma.
 *
 * FONTE DA VERDADE em webapi/src/turma/core. O worker recebe uma cópia gerada no
 * build (`npm run shared:sync`). Só importa @prisma/client e arquivos desta pasta.
 */
export class TurmaAcessoCore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ins: number,
    private readonly op: TurmaAcessoCoreOpcoes,
  ) {}

  private log(nivel: 'info' | 'warn' | 'error', mensagem: string) {
    this.op.log?.(nivel, `[turma-acesso ins=${this.ins}] ${mensagem}`);
  }

  // ── consultas ────────────────────────────────────────────────────────────

  async listar(filtro: FiltroTurmas = {}) {
    const page = Math.max(1, Number(filtro.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filtro.limit) || 50));

    const and: Prisma.TRMTurmaWhereInput[] = [{ INSInstituicaoCodigo: this.ins }];
    if (filtro.ativa !== 'todas') and.push({ TRMAtiva: filtro.ativa === undefined ? true : !!filtro.ativa });
    if (filtro.ano) and.push({ TRMAnoReferencia: filtro.ano });
    if (filtro.curso) and.push({ TRMCurso: filtro.curso });
    if (filtro.serie) and.push({ TRMSerie: filtro.serie });
    if (filtro.turno) and.push({ TRMTurno: filtro.turno });
    if (filtro.perfil) and.push({ PHACodigo: Number(filtro.perfil) });
    if (filtro.validacaoAtiva !== undefined) and.push({ TRMValidacaoAtiva: !!filtro.validacaoAtiva });
    if (filtro.equipamento) {
      and.push({
        TRMValidacaoAtiva: true,
        OR: [{ TRMTodosEquipamentos: true }, { escopo: { some: { EQPCodigo: Number(filtro.equipamento) } } }],
      });
    }
    if (filtro.busca?.trim()) {
      const q = filtro.busca.trim();
      and.push({
        OR: [
          { TRMTurma: { contains: q, mode: 'insensitive' } },
          { TRMCurso: { contains: q, mode: 'insensitive' } },
          { TRMSerie: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.TRMTurmaWhereInput = { AND: and };

    const [total, turmas, equipamentos] = await Promise.all([
      this.prisma.tRMTurma.count({ where }),
      this.prisma.tRMTurma.findMany({
        where,
        include: {
          escopo: { select: { EQPCodigo: true } },
          perfil: {
            select: {
              PHACodigo: true,
              PHANome: true,
              PHAHashConfig: true,
              equipamentos: { select: { EQPCodigo: true, PHESyncHash: true, PHEUltimoErro: true } },
            },
          },
        },
        orderBy: [{ TRMAnoReferencia: 'desc' }, { TRMCurso: 'asc' }, { TRMSerie: 'asc' }, { TRMTurma: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.equipamentosDaInstituicao(),
    ]);

    const ativos = equipamentos.filter((e) => e.EQPAtivo);
    const suporte = await this.mapaSuporte(ativos);
    const ativosCodigos = ativos.map((e) => e.EQPCodigo);

    const perfisCodigos = [...new Set(turmas.map((t) => t.PHACodigo).filter((c): c is number => c != null))];
    const usoPorPerfil = new Map<number, number>();
    if (perfisCodigos.length) {
      const grupos = await this.prisma.tRMTurma.groupBy({
        by: ['PHACodigo'],
        where: { INSInstituicaoCodigo: this.ins, PHACodigo: { in: perfisCodigos }, TRMValidacaoAtiva: true, TRMAtiva: true },
        _count: { _all: true },
      });
      for (const g of grupos) if (g.PHACodigo != null) usoPorPerfil.set(g.PHACodigo, g._count._all);
    }

    const data = turmas.map((t) => {
      const estado = paraTurmaEstado(t);
      const alvo = resolverEscopo(estado, ativosCodigos);
      let sync: { total: number; sincronizados: number; pendentes: number; erros: number; naoSuportados: number } | null = null;
      if (t.TRMValidacaoAtiva && t.perfil) {
        sync = { total: alvo.length, sincronizados: 0, pendentes: 0, erros: 0, naoSuportados: 0 };
        for (const eqp of alvo) {
          if (!suporte.get(eqp)) {
            sync.naoSuportados++;
            continue;
          }
          const phe = t.perfil.equipamentos.find((e) => e.EQPCodigo === eqp);
          if (phe?.PHESyncHash === t.perfil.PHAHashConfig) sync.sincronizados++;
          else if (phe?.PHEUltimoErro) sync.erros++;
          else sync.pendentes++;
        }
      }
      return {
        TRMCodigo: t.TRMCodigo,
        TRMIdExterno: t.TRMIdExterno,
        TRMTurma: t.TRMTurma,
        TRMCurso: t.TRMCurso,
        TRMSerie: t.TRMSerie,
        TRMTurno: t.TRMTurno,
        TRMAnoReferencia: t.TRMAnoReferencia,
        TRMCalendario: t.TRMCalendario,
        TRMAtiva: t.TRMAtiva,
        TRMValidacaoAtiva: t.TRMValidacaoAtiva,
        TRMPrioridade: t.TRMPrioridade,
        TRMQtdePessoas: t.TRMQtdePessoas,
        TRMAlteradoEm: t.TRMAlteradoEm,
        perfil: t.perfil
          ? { PHACodigo: t.perfil.PHACodigo, PHANome: t.perfil.PHANome, qtdeTurmas: usoPorPerfil.get(t.perfil.PHACodigo) ?? 0 }
          : null,
        escopo: { todos: t.TRMTodosEquipamentos, EQPCodigos: estado.escopo, total: alvo.length },
        sync,
      };
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async opcoesFiltro() {
    const [turmas, perfis, equipamentos] = await Promise.all([
      this.prisma.tRMTurma.findMany({
        where: { INSInstituicaoCodigo: this.ins, TRMAtiva: true },
        select: { TRMAnoReferencia: true, TRMCurso: true, TRMSerie: true, TRMTurno: true },
      }),
      this.prisma.pHAPerfilHorario.findMany({
        where: { INSInstituicaoCodigo: this.ins },
        select: { PHACodigo: true, PHANome: true },
        orderBy: { PHANome: 'asc' },
      }),
      this.prisma.eQPEquipamento.findMany({
        where: { INSInstituicaoCodigo: this.ins, EQPAtivo: true },
        select: { EQPCodigo: true, EQPDescricao: true },
        orderBy: [{ EQPDescricao: 'asc' }, { EQPCodigo: 'asc' }],
      }),
    ]);
    const distintos = (valores: Array<string | null>) =>
      [...new Set(valores.filter((v): v is string => !!v && v.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      anos: distintos(turmas.map((t) => t.TRMAnoReferencia)).reverse(),
      cursos: distintos(turmas.map((t) => t.TRMCurso)),
      series: distintos(turmas.map((t) => t.TRMSerie)),
      turnos: distintos(turmas.map((t) => t.TRMTurno)),
      perfis,
      equipamentos,
    };
  }

  async obter(trmCodigo: number) {
    const turma = await this.prisma.tRMTurma.findFirst({
      where: { TRMCodigo: Number(trmCodigo), INSInstituicaoCodigo: this.ins },
      include: {
        escopo: { select: { EQPCodigo: true } },
        usuarioAlteracao: { select: { USRNome: true } },
        perfil: {
          include: {
            janelas: { orderBy: { PHJOrdem: 'asc' } },
            equipamentos: true,
            turmas: {
              where: { TRMValidacaoAtiva: true, TRMAtiva: true },
              select: { TRMCodigo: true, TRMSerie: true, TRMTurma: true, TRMTurno: true, TRMAnoReferencia: true },
            },
          },
        },
      },
    });
    if (!turma) throw new TurmaAcessoErro('Turma não encontrada', 'nao_encontrado');

    const equipamentos = await this.equipamentosDaInstituicao();
    const suporte = await this.mapaSuporte(equipamentos.filter((e) => e.EQPAtivo));
    const estado = paraTurmaEstado(turma);
    const ativosCodigos = equipamentos.filter((e) => e.EQPAtivo).map((e) => e.EQPCodigo);
    const alvo = new Set(resolverEscopo(estado, ativosCodigos));

    return {
      TRMCodigo: turma.TRMCodigo,
      TRMIdExterno: turma.TRMIdExterno,
      TRMTurma: turma.TRMTurma,
      TRMCurso: turma.TRMCurso,
      TRMSerie: turma.TRMSerie,
      TRMCurriculo: turma.TRMCurriculo,
      TRMTurno: turma.TRMTurno,
      TRMAnoReferencia: turma.TRMAnoReferencia,
      TRMCalendario: turma.TRMCalendario,
      TRMDataInicio: turma.TRMDataInicio,
      TRMDataFim: turma.TRMDataFim,
      TRMAtiva: turma.TRMAtiva,
      TRMValidacaoAtiva: turma.TRMValidacaoAtiva,
      TRMPrioridade: turma.TRMPrioridade,
      TRMQtdePessoas: turma.TRMQtdePessoas,
      rotulo: rotuloTurma(turma),
      alteracao: {
        em: turma.TRMAlteradoEm,
        usuario: turma.usuarioAlteracao?.USRNome ?? null,
        rotina: turma.ROTCodigoAlteracao,
      },
      horarios: turma.perfil ? turma.perfil.janelas.map(linhaParaJanela) : [],
      perfil: turma.perfil
        ? {
            PHACodigo: turma.perfil.PHACodigo,
            PHANome: turma.perfil.PHANome,
            outrasTurmas: turma.perfil.turmas.filter((t) => t.TRMCodigo !== turma.TRMCodigo).map(rotuloTurma),
          }
        : null,
      escopo: { todos: turma.TRMTodosEquipamentos, EQPCodigos: estado.escopo },
      equipamentos: equipamentos.map((e) => {
        const phe = turma.perfil?.equipamentos.find((p) => p.EQPCodigo === e.EQPCodigo);
        let sync: { status: 'em_dia' | 'pendente' | 'erro'; em: Date | null; erro: string | null } | null = null;
        if (turma.TRMValidacaoAtiva && turma.perfil && alvo.has(e.EQPCodigo) && suporte.get(e.EQPCodigo)) {
          const emDia = phe?.PHESyncHash === turma.perfil.PHAHashConfig;
          sync = {
            status: emDia ? 'em_dia' : phe?.PHEUltimoErro ? 'erro' : 'pendente',
            em: phe?.PHESyncedAt ?? null,
            erro: emDia ? null : (phe?.PHEUltimoErro ?? null),
          };
        }
        return {
          EQPCodigo: e.EQPCodigo,
          EQPDescricao: e.EQPDescricao,
          EQPMarca: e.EQPMarca,
          EQPModelo: e.EQPModelo,
          EQPAtivo: e.EQPAtivo,
          suportado: !!suporte.get(e.EQPCodigo),
          selecionado: estado.escopo.includes(e.EQPCodigo),
          noEscopo: alvo.has(e.EQPCodigo),
          sync,
        };
      }),
    };
  }

  /** Aba "Perfis de horário" (§13.4): uso, horário e estado nos equipamentos. */
  async listarPerfis() {
    const [perfis, turmasLinhas, equipamentos] = await Promise.all([
      this.prisma.pHAPerfilHorario.findMany({
        where: { INSInstituicaoCodigo: this.ins },
        include: { janelas: { orderBy: { PHJOrdem: 'asc' } }, equipamentos: true },
        orderBy: { PHANome: 'asc' },
      }),
      this.prisma.tRMTurma.findMany({
        where: { INSInstituicaoCodigo: this.ins, PHACodigo: { not: null } },
        include: { escopo: { select: { EQPCodigo: true } } },
      }),
      this.equipamentosDaInstituicao(),
    ]);
    const turmas = turmasLinhas.map(paraTurmaEstado);
    const suporte = await this.mapaSuporte(equipamentos.filter((e) => e.EQPAtivo));

    return perfis.map((p) => {
      const vigentes = turmasLinhas.filter((t) => t.PHACodigo === p.PHACodigo && t.TRMValidacaoAtiva && t.TRMAtiva);
      const alvo = equipamentos.filter((e) => perfilDeveExistir(p.PHACodigo, e, turmas));
      const contagem = { total: alvo.length, sincronizados: 0, pendentes: 0, erros: 0, naoSuportados: 0 };
      for (const e of alvo) {
        if (!suporte.get(e.EQPCodigo)) {
          contagem.naoSuportados++;
          continue;
        }
        const phe = p.equipamentos.find((x) => x.EQPCodigo === e.EQPCodigo);
        if (phe?.PHESyncHash === p.PHAHashConfig) contagem.sincronizados++;
        else if (phe?.PHEUltimoErro) contagem.erros++;
        else contagem.pendentes++;
      }
      const removendo = p.equipamentos
        .filter((phe) => (phe.PHESyncHash || phe.PHEIdGrupo) && !alvo.some((e) => e.EQPCodigo === phe.EQPCodigo))
        .map((phe) => ({
          EQPCodigo: phe.EQPCodigo,
          EQPDescricao: equipamentos.find((e) => e.EQPCodigo === phe.EQPCodigo)?.EQPDescricao ?? null,
          mensagem: phe.PHEUltimoErro,
        }));

      return {
        PHACodigo: p.PHACodigo,
        PHANome: p.PHANome,
        horarios: p.janelas.map(linhaParaJanela),
        turmas: vigentes.map((t) => ({ TRMCodigo: t.TRMCodigo, rotulo: rotuloTurma(t) })),
        emUso: vigentes.length > 0,
        equipamentos: contagem,
        removendo,
      };
    });
  }

  /** Mostra, antes de salvar, se o horário cai num perfil existente ou cria um novo (§6.2). */
  async previewPerfil(horarios: JanelaEntrada[], trmCodigo?: number | null) {
    const erros = validarJanelas(horarios);
    if (erros.length) return { erros, perfilExistente: null, nomeSugerido: null, perfilAtual: null, mesmoPerfilAtual: false };

    const turma = trmCodigo
      ? await this.prisma.tRMTurma.findFirst({ where: { TRMCodigo: Number(trmCodigo), INSInstituicaoCodigo: this.ins } })
      : null;

    const hash = hashJanelas(canonizar(horarios));
    const existente = await this.prisma.pHAPerfilHorario.findFirst({
      where: { INSInstituicaoCodigo: this.ins, PHAHashJanelas: hash },
      include: {
        turmas: {
          where: { TRMValidacaoAtiva: true, TRMAtiva: true },
          select: { TRMCodigo: true, TRMSerie: true, TRMTurma: true, TRMTurno: true, TRMAnoReferencia: true },
        },
      },
    });

    let perfilAtual: { PHACodigo: number; PHANome: string; outrasTurmas: number } | null = null;
    if (turma?.PHACodigo && turma.TRMValidacaoAtiva) {
      const atual = await this.prisma.pHAPerfilHorario.findFirst({
        where: { PHACodigo: turma.PHACodigo, INSInstituicaoCodigo: this.ins },
        include: { _count: { select: { turmas: { where: { TRMValidacaoAtiva: true, TRMAtiva: true } } } } },
      });
      if (atual) {
        perfilAtual = { PHACodigo: atual.PHACodigo, PHANome: atual.PHANome, outrasTurmas: Math.max(0, atual._count.turmas - 1) };
      }
    }

    if (existente) {
      return {
        erros: [],
        perfilExistente: {
          PHACodigo: existente.PHACodigo,
          PHANome: existente.PHANome,
          turmas: existente.turmas.filter((t) => t.TRMCodigo !== turma?.TRMCodigo).map(rotuloTurma),
        },
        nomeSugerido: null,
        perfilAtual,
        mesmoPerfilAtual: perfilAtual?.PHACodigo === existente.PHACodigo,
      };
    }

    return {
      erros: [],
      perfilExistente: null,
      nomeSugerido: sugerirNomePerfil(turma?.TRMTurno, await this.nomesReservados()),
      perfilAtual,
      mesmoPerfilAtual: false,
    };
  }

  // ── gravação ─────────────────────────────────────────────────────────────

  async salvarValidacao(trmCodigo: number, entrada: ValidacaoEntrada, origem: Origem) {
    return this.salvarValidacaoEmLote([trmCodigo], entrada, origem);
  }

  /** §11.4: valida → perfil → transação (turma + escopo + invalidação) → sync direto nos equipamentos. */
  async salvarValidacaoEmLote(trmCodigos: number[], entrada: ValidacaoEntrada, origem: Origem) {
    const codigos = inteiros(trmCodigos);
    if (!codigos.length) throw new TurmaAcessoErro('Informe ao menos uma turma', 'validacao');
    if (!entrada || typeof entrada.ativa !== 'boolean') {
      throw new TurmaAcessoErro('Informe se a validação está ativa', 'validacao');
    }

    const turmas = await this.prisma.tRMTurma.findMany({
      where: { INSInstituicaoCodigo: this.ins, TRMCodigo: { in: codigos } },
      include: { escopo: { select: { EQPCodigo: true } } },
    });
    if (turmas.length !== codigos.length) {
      const achadas = new Set(turmas.map((t) => t.TRMCodigo));
      throw new TurmaAcessoErro('Turma não encontrada', 'nao_encontrado', {
        TRMCodigos: codigos.filter((c) => !achadas.has(c)),
      });
    }

    const equipamentos = await this.equipamentosDaInstituicao();
    const ativosCodigos = equipamentos.filter((e) => e.EQPAtivo).map((e) => e.EQPCodigo);

    let perfilNovo: PHAPerfilHorario | null = null;
    let perfilCriado = false;
    let escopoNovo: { todos: boolean; EQPCodigos: number[] } | null = null;

    if (entrada.ativa) {
      const erros = validarJanelas(entrada.horarios);
      if (erros.length) throw new TurmaAcessoErro(`Horário inválido: ${erros.join('; ')}`, 'validacao', { erros });
      escopoNovo = await this.validarEscopo(entrada.escopo, equipamentos);
      const r = await this.obterOuCriarPerfil(entrada.horarios, turmas[0].TRMTurno);
      perfilNovo = r.perfil;
      perfilCriado = r.criado;
    }

    const perfisAfetados = new Set<number>();
    if (perfilNovo) perfisAfetados.add(perfilNovo.PHACodigo);
    let pessoasInvalidadas = 0;
    const auditoria = this.auditoria(origem);

    await this.prisma.$transaction(
      async (tx) => {
        for (const turma of turmas) {
          const antes = paraTurmaEstado(turma);
          if (turma.PHACodigo) perfisAfetados.add(turma.PHACodigo);

          if (!entrada.ativa) {
            // Desativar preserva perfil e escopo: a tela reabre com a última configuração.
            await tx.tRMTurma.update({ where: { TRMCodigo: turma.TRMCodigo }, data: { TRMValidacaoAtiva: false, ...auditoria } });
            continue;
          }

          await tx.tRMTurma.update({
            where: { TRMCodigo: turma.TRMCodigo },
            data: {
              PHACodigo: perfilNovo!.PHACodigo,
              TRMValidacaoAtiva: true,
              TRMTodosEquipamentos: escopoNovo!.todos,
              ...auditoria,
            },
          });
          await tx.tEQTurmaEquipamento.deleteMany({ where: { TRMCodigo: turma.TRMCodigo } });
          if (!escopoNovo!.todos) {
            await tx.tEQTurmaEquipamento.createMany({
              data: escopoNovo!.EQPCodigos.map((EQPCodigo) => ({
                INSInstituicaoCodigo: this.ins,
                TRMCodigo: turma.TRMCodigo,
                EQPCodigo,
              })),
            });
          }

          // §7.4: mudar escopo não move PESPessoa.updatedAt — invalida os pares afetados.
          if (antes.TRMValidacaoAtiva) {
            const escopoAntes = resolverEscopo(antes, ativosCodigos);
            const escopoDepois = resolverEscopo(
              { TRMTodosEquipamentos: escopoNovo!.todos, escopo: escopoNovo!.EQPCodigos },
              ativosCodigos,
            );
            const afetados = diferencaSimetrica(escopoAntes, escopoDepois);
            if (afetados.length) pessoasInvalidadas += await this.invalidarPessoasDaTurma(tx, turma.TRMCodigo, afetados);
          }
        }
      },
      { timeout: TIMEOUT_TRANSACAO_MS },
    );

    const resultados = await this.sincronizarPerfis([...perfisAfetados], {});

    return {
      TRMCodigos: codigos,
      ativa: entrada.ativa,
      perfil: perfilNovo ? { PHACodigo: perfilNovo.PHACodigo, PHANome: perfilNovo.PHANome, criado: perfilCriado } : null,
      pessoasInvalidadas,
      resultados,
    };
  }

  async renomearPerfil(phaCodigo: number, nome: string, _origem: Origem) {
    const perfil = await this.prisma.pHAPerfilHorario.findFirst({
      where: { PHACodigo: Number(phaCodigo), INSInstituicaoCodigo: this.ins },
      include: { janelas: { orderBy: { PHJOrdem: 'asc' } } },
    });
    if (!perfil) throw new TurmaAcessoErro('Perfil de horário não encontrado', 'nao_encontrado');

    const novo = normalizarNomePerfil(nome);
    if (novo === perfil.PHANome) return { PHACodigo: perfil.PHACodigo, PHANome: perfil.PHANome, resultados: [] };

    const erro = validarNomePerfil(novo, await this.nomesReservados(perfil.PHACodigo));
    if (erro) throw new TurmaAcessoErro(erro, 'validacao');

    const canonico = canonizar(perfil.janelas.map(linhaParaJanela));
    try {
      await this.prisma.pHAPerfilHorario.update({
        where: { PHACodigo: perfil.PHACodigo },
        data: { PHANome: novo, PHAHashConfig: hashConfig(novo, canonico) },
      });
    } catch (err) {
      if (violouUnique(err)) throw new TurmaAcessoErro(`O nome "${novo}" já está em uso`, 'conflito');
      throw err;
    }

    // O equipamento é renomeado por id; os membros migram de nome na rotina de vínculo.
    return { PHACodigo: perfil.PHACodigo, PHANome: novo, resultados: await this.sincronizarPerfis([perfil.PHACodigo], {}) };
  }

  // ── sincronização com o hardware ─────────────────────────────────────────

  async sincronizar(opcoes: { PHACodigo?: number; TRMCodigo?: number; EQPCodigos?: number[]; forcar?: boolean } = {}) {
    let perfis: number[];
    if (opcoes.TRMCodigo) {
      const turma = await this.prisma.tRMTurma.findFirst({
        where: { TRMCodigo: Number(opcoes.TRMCodigo), INSInstituicaoCodigo: this.ins },
        select: { PHACodigo: true },
      });
      if (!turma) throw new TurmaAcessoErro('Turma não encontrada', 'nao_encontrado');
      perfis = turma.PHACodigo ? [turma.PHACodigo] : [];
    } else if (opcoes.PHACodigo) {
      perfis = [Number(opcoes.PHACodigo)];
    } else {
      perfis = await this.todosPerfis();
    }
    const resultados = await this.sincronizarPerfis(perfis, { EQPCodigos: opcoes.EQPCodigos, forcar: !!opcoes.forcar });
    return { resumo: this.resumir(resultados), resultados };
  }

  /** Rotina de reconciliação (§12.5): device offline, equipamento novo, perfil sem uso, grupos padrão ausentes. */
  async reconciliar(opcoes: { EQPCodigos?: number[] } = {}) {
    const resultados = await this.sincronizarPerfis(await this.todosPerfis(), { EQPCodigos: opcoes.EQPCodigos });

    const gruposPadrao = (
      await this.prisma.pESPessoa.findMany({
        where: { INSInstituicaoCodigo: this.ins, PESAtivo: true, PESGrupo: { not: null } },
        distinct: ['PESGrupo'],
        select: { PESGrupo: true },
      })
    )
      .map((p) => (p.PESGrupo ?? '').trim())
      .filter(Boolean);

    const filtro = inteiros(opcoes.EQPCodigos);
    const gruposPadraoAusentes: Array<{ EQPCodigo: number; EQPDescricao: string | null; faltando: string[] }> = [];
    for (const eqp of (await this.equipamentosDaInstituicao()).filter((e) => e.EQPAtivo)) {
      if (filtro.length && !filtro.includes(eqp.EQPCodigo)) continue;
      if (!(await this.op.hardware.suporta(eqp))) continue;
      try {
        const nomes = (await this.op.hardware.listarGrupos(eqp)).map((g) => g.nome.trim().toLowerCase());
        const faltando = gruposPadrao.filter((g) => !nomes.includes(g.toLowerCase()));
        if (faltando.length) {
          gruposPadraoAusentes.push({ EQPCodigo: eqp.EQPCodigo, EQPDescricao: eqp.EQPDescricao, faltando });
          await this.notificar(
            `turma:${this.ins}:grupos-padrao:${eqp.EQPCodigo}`,
            'erro',
            `Grupos padrão ausentes em ${eqp.EQPDescricao ?? `equipamento ${eqp.EQPCodigo}`}`,
            `Pessoas fora do escopo de turma voltam para estes grupos, que não existem no equipamento: ${faltando.join(', ')}. ` +
              'Enquanto faltarem, essas pessoas ficam pendentes de sincronização.',
            'turma_grupos_padrao',
            String(eqp.EQPCodigo),
          );
        }
      } catch (err) {
        this.log('warn', `Não foi possível listar grupos do EQP ${eqp.EQPCodigo}: ${mensagemDe(err)}`);
      }
    }

    return { resumo: this.resumir(resultados), resultados, gruposPadraoAusentes };
  }

  /**
   * Aplica o estado desejado de cada (perfil, equipamento). Equipamentos em paralelo;
   * dentro de um equipamento, sequencial e sob lock (§10.5).
   */
  private async sincronizarPerfis(
    phaCodigos: number[],
    opcoes: { EQPCodigos?: number[]; forcar?: boolean },
  ): Promise<ResultadoEquipamento[]> {
    const codigos = inteiros(phaCodigos);
    if (!codigos.length) return [];

    const [perfis, turmasLinhas, equipamentos] = await Promise.all([
      this.prisma.pHAPerfilHorario.findMany({
        where: { INSInstituicaoCodigo: this.ins, PHACodigo: { in: codigos } },
        include: { janelas: { orderBy: { PHJOrdem: 'asc' } }, equipamentos: true },
      }),
      this.prisma.tRMTurma.findMany({
        where: { INSInstituicaoCodigo: this.ins, PHACodigo: { in: codigos } },
        include: { escopo: { select: { EQPCodigo: true } } },
      }),
      this.equipamentosDaInstituicao(),
    ]);
    const turmas = turmasLinhas.map(paraTurmaEstado);
    const filtro = inteiros(opcoes.EQPCodigos);

    const porEquipamento = new Map<number, Array<{ perfil: PerfilParaSync; canonico: Canonico }>>();
    for (const perfil of perfis) {
      const canonico = canonizar(perfil.janelas.map(linhaParaJanela));
      for (const eqp of equipamentos) {
        if (filtro.length && !filtro.includes(eqp.EQPCodigo)) continue;
        const temLinha = perfil.equipamentos.some((p) => p.EQPCodigo === eqp.EQPCodigo);
        if (!temLinha && !perfilDeveExistir(perfil.PHACodigo, eqp, turmas)) continue;
        const lista = porEquipamento.get(eqp.EQPCodigo) ?? [];
        lista.push({ perfil, canonico });
        porEquipamento.set(eqp.EQPCodigo, lista);
      }
    }

    const porCodigo = new Map(equipamentos.map((e) => [e.EQPCodigo, e]));
    const resultados: ResultadoEquipamento[] = [];

    await Promise.all(
      [...porEquipamento].map(async ([eqpCodigo, itens]) => {
        const eqp = porCodigo.get(eqpCodigo)!;
        try {
          const r = await this.op.lock.comLock(this.op.chaveLock(this.ins, eqpCodigo), LOCK_TTL_MS, async () => {
            const saida: ResultadoEquipamento[] = [];
            for (const item of itens) saida.push(await this.sincronizarPar(eqp, item.perfil, item.canonico, turmas, !!opcoes.forcar));
            return saida;
          });
          if (r.ocupado) {
            resultados.push(
              ...itens.map((i) =>
                this.resultado(eqp, i.perfil, 'ocupado', 'Outro processo está sincronizando este equipamento; será concluído em seguida'),
              ),
            );
          } else {
            resultados.push(...r.valor);
          }
        } catch (err) {
          resultados.push(...itens.map((i) => this.resultado(eqp, i.perfil, 'erro', `Lock indisponível: ${mensagemDe(err)}`)));
        }
      }),
    );

    return resultados.sort(
      (a, b) => (a.EQPDescricao ?? '').localeCompare(b.EQPDescricao ?? '', 'pt-BR') || a.PHANome.localeCompare(b.PHANome),
    );
  }

  private async sincronizarPar(
    eqp: EQPEquipamento,
    perfil: PerfilParaSync,
    canonico: Canonico,
    turmas: TurmaEstado[],
    forcar: boolean,
  ): Promise<ResultadoEquipamento> {
    const phe = perfil.equipamentos.find((p) => p.EQPCodigo === eqp.EQPCodigo) ?? null;
    const desejado = hashDesejado(perfil, eqp, turmas);
    const ref: HardwareAccessGroupRef | undefined = phe
      ? { groupId: phe.PHEIdGrupo ?? undefined, accessRuleId: phe.PHEIdRegraAcesso ?? undefined, timeZoneId: phe.PHEIdHorario ?? undefined }
      : undefined;
    const chave = { PHACodigo_EQPCodigo: { PHACodigo: perfil.PHACodigo, EQPCodigo: eqp.EQPCodigo } };

    const gravar = (data: Partial<PHEPerfilEquipamento>) =>
      this.prisma.pHEPerfilEquipamento.upsert({
        where: chave,
        create: { INSInstituicaoCodigo: this.ins, PHACodigo: perfil.PHACodigo, EQPCodigo: eqp.EQPCodigo, ...data },
        update: data,
      });

    if (!eqp.EQPAtivo) return this.resultado(eqp, perfil, 'inativo', 'Equipamento inativo — nada é enviado');

    const nadaAplicado = !phe?.PHESyncHash && !phe?.PHEIdGrupo;
    if (desejado === null && nadaAplicado) {
      if (phe) await this.prisma.pHEPerfilEquipamento.deleteMany({ where: { PHECodigo: phe.PHECodigo } });
      return this.resultado(eqp, perfil, 'sem_mudanca');
    }
    if (!forcar && desejado !== null && phe?.PHESyncHash === desejado) {
      return this.resultado(eqp, perfil, 'sem_mudanca');
    }

    const suporta = await this.op.hardware.suporta(eqp);
    try {
      if (desejado !== null) {
        if (!suporta) {
          await gravar({ PHEUltimoErro: 'Marca/modelo sem suporte a controle de acesso por turma' });
          return this.resultado(eqp, perfil, 'nao_suportado');
        }
        const novoRef = await this.op.hardware.sync(eqp, { nome: perfil.PHANome, dias: canonico }, ref);
        await gravar({
          PHEIdGrupo: novoRef.groupId ?? null,
          PHEIdRegraAcesso: novoRef.accessRuleId ?? null,
          PHEIdHorario: novoRef.timeZoneId ?? null,
          PHESyncHash: desejado,
          PHESyncedAt: new Date(),
          PHEUltimoErro: null,
        });
        return this.resultado(eqp, perfil, 'aplicado');
      }

      // Remoção (§7.5): só com o grupo vazio NO EQUIPAMENTO — é a única fonte que enxerga vínculos externos.
      if (!suporta) {
        await gravar({ PHEUltimoErro: 'Marca/modelo sem suporte para remover o perfil' });
        return this.resultado(eqp, perfil, 'nao_suportado');
      }
      const membros = await this.op.hardware.contarMembros(eqp, ref ?? {});
      if (membros > 0) {
        const msg = `Aguardando ${membros} pessoa(s) saírem do grupo antes de remover o horário`;
        await gravar({ PHEUltimoErro: msg });
        return this.resultado(eqp, perfil, 'aguardando_membros', msg);
      }
      await this.op.hardware.remover(eqp, ref ?? {});
      await this.prisma.pHEPerfilEquipamento.deleteMany({ where: chave.PHACodigo_EQPCodigo });
      return this.resultado(eqp, perfil, 'removido');
    } catch (err) {
      const msg = mensagemDe(err);
      this.log('warn', `EQP ${eqp.EQPCodigo} perfil ${perfil.PHANome}: ${msg}`);
      await gravar({ PHEUltimoErro: msg.slice(0, 1000) }).catch(() => undefined);
      return this.resultado(eqp, perfil, 'erro', msg);
    }
  }

  // ── pessoas ──────────────────────────────────────────────────────────────

  /** Departamento de uma pessoa em cada equipamento. Chaves são EQPCodigo em string (seguro para IPC). */
  async gruposNoEquipamentos(pescodigo: number, eqpCodigos: number[]): Promise<Record<string, string | null>> {
    const pessoa = await this.prisma.pESPessoa.findFirst({
      where: { PESCodigo: Number(pescodigo), INSInstituicaoCodigo: this.ins },
      select: { PESCodigo: true, INSInstituicaoCodigo: true, PESGrupo: true, PESTRMCodigo: true },
    });
    if (!pessoa) throw new TurmaAcessoErro('Pessoa não encontrada', 'nao_encontrado');
    const mapa = await resolverGruposDaPessoa(this.prisma, pessoa, inteiros(eqpCodigos));
    return Object.fromEntries([...mapa].map(([k, v]) => [String(k), v]));
  }

  async grupoNoEquipamento(pescodigo: number, eqpCodigo: number): Promise<string | null> {
    const r = await this.gruposNoEquipamentos(pescodigo, [eqpCodigo]);
    return r[String(eqpCodigo)] ?? null;
  }

  /**
   * Rotina de vínculo (§12.3): elege a turma efetiva de cada pessoa e grava só quando
   * muda — gravar sem mudança moveria updatedAt e reenfileiraria a base inteira.
   */
  async vincularPessoas() {
    const turmas = await this.prisma.tRMTurma.findMany({
      where: { INSInstituicaoCodigo: this.ins, TRMValidacaoAtiva: true, TRMAtiva: true, PHACodigo: { not: null } },
      select: {
        TRMCodigo: true,
        TRMPrioridade: true,
        TRMSerie: true,
        TRMTurma: true,
        TRMTurno: true,
        TRMAnoReferencia: true,
        perfil: { select: { PHANome: true } },
      },
    });
    const porTurma = new Map(turmas.map((t) => [t.TRMCodigo, t]));

    const matriculas = porTurma.size
      ? await this.prisma.mATMatricula.findMany({
          where: { INSInstituicaoCodigo: this.ins, MATAtivo: true, TRMCodigo: { in: [...porTurma.keys()] } },
          select: { PESCodigo: true, TRMCodigo: true, createdAt: true },
        })
      : [];

    const candidatasPorPessoa = new Map<number, Array<{ TRMCodigo: number; TRMPrioridade: number; matriculaCriadaEm: Date }>>();
    for (const m of matriculas) {
      const t = porTurma.get(m.TRMCodigo!);
      if (!t) continue;
      const lista = candidatasPorPessoa.get(m.PESCodigo) ?? [];
      if (!lista.some((c) => c.TRMCodigo === t.TRMCodigo)) {
        lista.push({ TRMCodigo: t.TRMCodigo, TRMPrioridade: t.TRMPrioridade, matriculaCriadaEm: m.createdAt });
      }
      candidatasPorPessoa.set(m.PESCodigo, lista);
    }

    const pessoas = await this.prisma.pESPessoa.findMany({
      where: {
        INSInstituicaoCodigo: this.ins,
        OR: [{ PESTRMCodigo: { not: null } }, { PESCodigo: { in: [...candidatasPorPessoa.keys()] } }],
      },
      select: { PESCodigo: true, PESNome: true, PESTRMCodigo: true, PESGrupoHorario: true },
    });

    const mudancas = new Map<string, number[]>(); // "TRMCodigo|grupo" → PESCodigos
    const conflitos: Array<{ PESCodigo: number; PESNome: string; turmas: string[]; eleita: string }> = [];

    for (const p of pessoas) {
      const candidatas = candidatasPorPessoa.get(p.PESCodigo) ?? [];
      const eleita = elegerTurma(candidatas);
      const novoCodigo = eleita?.TRMCodigo ?? null;
      const novoGrupo = eleita ? (porTurma.get(eleita.TRMCodigo)?.perfil?.PHANome ?? null) : null;

      if (p.PESTRMCodigo !== novoCodigo || p.PESGrupoHorario !== novoGrupo) {
        const k = `${novoCodigo ?? ''}|${novoGrupo ?? ''}`;
        mudancas.set(k, [...(mudancas.get(k) ?? []), p.PESCodigo]);
      }
      if (candidatas.length > 1 && eleita) {
        conflitos.push({
          PESCodigo: p.PESCodigo,
          PESNome: p.PESNome,
          turmas: candidatas.map((c) => rotuloTurma(porTurma.get(c.TRMCodigo)!)),
          eleita: rotuloTurma(porTurma.get(eleita.TRMCodigo)!),
        });
      }
    }

    let alteradas = 0;
    for (const [k, pescodigos] of mudancas) {
      const [codigo, grupo] = k.split('|');
      const r = await this.prisma.pESPessoa.updateMany({
        where: { INSInstituicaoCodigo: this.ins, PESCodigo: { in: pescodigos } },
        data: { PESTRMCodigo: codigo ? Number(codigo) : null, PESGrupoHorario: grupo || null },
      });
      alteradas += r.count;
    }

    for (const c of conflitos) {
      await this.notificar(
        `turma:${this.ins}:conflito:${c.PESCodigo}`,
        'erro',
        `${c.PESNome} está em mais de uma turma com controle de acesso`,
        `Turmas: ${c.turmas.join('; ')}. Aplicada: ${c.eleita}. ` +
          'O equipamento aceita um único departamento por pessoa — ajuste a prioridade das turmas se a escolha estiver errada.',
        'turma_conflito',
        String(c.PESCodigo),
      );
    }

    return { avaliadas: pessoas.length, alteradas, conflitos: conflitos.length };
  }

  // ── catálogo (ERP) ───────────────────────────────────────────────────────

  /**
   * Rotina de catálogo (§12.2). Recebe o catálogo COMPLETO lido do ERP: turmas que não
   * vierem são desativadas. A rotina deve abortar antes de chamar se qualquer leitura
   * do ERP falhou (§15, item 21) — catálogo vazio é recusado aqui como proteção extra.
   */
  async importarCatalogo(entrada: CatalogoEntrada) {
    const lista = Array.isArray(entrada?.turmas) ? entrada.turmas : [];
    if (!lista.length) {
      throw new TurmaAcessoErro(
        'Catálogo vazio recusado: isso desativaria todas as turmas. Verifique a leitura do ERP.',
        'validacao',
      );
    }

    const vistas = new Map<string, (typeof lista)[number]>();
    for (const t of lista) {
      const id = String(t?.idExterno ?? '').trim();
      if (!id || !t?.nome) throw new TurmaAcessoErro('Turma do catálogo sem idExterno ou nome', 'validacao', { turma: t });
      vistas.set(id, t);
    }

    const existentes = await this.prisma.tRMTurma.findMany({ where: { INSInstituicaoCodigo: this.ins } });
    const porIdExterno = new Map(existentes.map((t) => [t.TRMIdExterno, t]));

    let criadas = 0;
    let atualizadas = 0;
    for (const [idExterno, t] of vistas) {
      const dados = {
        TRMIdOferta: t.idOferta != null ? String(t.idOferta) : null,
        TRMTurma: String(t.nome),
        TRMCurso: t.curso ?? null,
        TRMSerie: t.serie ?? null,
        TRMCurriculo: t.curriculo ?? null,
        TRMTurno: t.turno ? String(t.turno) : null,
        TRMAnoReferencia: t.anoReferencia != null ? String(t.anoReferencia) : null,
        TRMCalendario: t.calendario ?? null,
        TRMDataInicio: paraData(t.dataInicio),
        TRMDataFim: paraData(t.dataFim),
        TRMAtiva: true,
      };
      const atual = porIdExterno.get(idExterno);
      if (!atual) {
        await this.prisma.tRMTurma.create({ data: { INSInstituicaoCodigo: this.ins, TRMIdExterno: idExterno, ...dados } });
        criadas++;
        continue;
      }
      const mudou = (Object.keys(dados) as Array<keyof typeof dados>).some((k) => {
        const a = atual[k] instanceof Date ? (atual[k] as Date).getTime() : atual[k];
        const b = dados[k] instanceof Date ? (dados[k] as Date).getTime() : dados[k];
        return (a ?? null) !== (b ?? null);
      });
      if (mudou) {
        await this.prisma.tRMTurma.update({ where: { TRMCodigo: atual.TRMCodigo }, data: dados });
        atualizadas++;
      }
    }

    const saindo = existentes.filter((t) => t.TRMAtiva && !vistas.has(t.TRMIdExterno));
    if (saindo.length) {
      await this.prisma.tRMTurma.updateMany({
        where: { INSInstituicaoCodigo: this.ins, TRMCodigo: { in: saindo.map((t) => t.TRMCodigo) } },
        data: { TRMAtiva: false },
      });
    }

    const vinculo = await this.vincularMatriculas(entrada.matriculasPorTurma ?? {});

    const configuradasSaindo = saindo.filter((t) => t.TRMValidacaoAtiva);
    if (configuradasSaindo.length) {
      await this.notificar(
        `turma:${this.ins}:saida-origem:${new Date().toISOString().slice(0, 10)}`,
        'aviso',
        `${configuradasSaindo.length} turma(s) com controle de acesso saíram do ERP`,
        `Os alunos dessas turmas deixam de ter restrição de horário até as novas turmas serem configuradas. ` +
          `Use "Importar configuração do ano anterior" na tela Turmas. Turmas: ${configuradasSaindo.map(rotuloTurma).join('; ')}.`,
        'turma_saida_origem',
        String(this.ins),
      );
    }

    return {
      turmasRecebidas: vistas.size,
      criadas,
      atualizadas,
      desativadas: saindo.length,
      ...vinculo,
    };
  }

  private async vincularMatriculas(matriculasPorTurma: Record<string, Array<string | number>>) {
    const turmasAtivas = await this.prisma.tRMTurma.findMany({
      where: { INSInstituicaoCodigo: this.ins, TRMAtiva: true },
      select: { TRMCodigo: true, TRMIdExterno: true, TRMTurma: true },
    });
    const porIdExterno = new Map(turmasAtivas.map((t) => [t.TRMIdExterno, t]));

    const candidatas = new Map<string, Array<{ TRMCodigo: number; TRMTurma: string }>>();
    for (const [idExterno, enrollments] of Object.entries(matriculasPorTurma)) {
      const turma = porIdExterno.get(String(idExterno));
      if (!turma || !Array.isArray(enrollments)) continue;
      for (const e of enrollments) {
        const k = String(e);
        const lista = candidatas.get(k) ?? [];
        if (!lista.some((c) => c.TRMCodigo === turma.TRMCodigo)) lista.push(turma);
        candidatas.set(k, lista);
      }
    }

    const matriculas = await this.prisma.mATMatricula.findMany({
      where: { INSInstituicaoCodigo: this.ins, MATAtivo: true },
      select: { MATCodigo: true, MATNumero: true, MATTurma: true, TRMCodigo: true, PESCodigo: true },
    });

    const mudancas = new Map<number | null, number[]>();
    let ambiguas = 0;
    for (const m of matriculas) {
      const r = resolverTurmaDaMatricula(m, candidatas.get(String(m.MATNumero)) ?? []);
      if (r.ambiguo) ambiguas++;
      if (r.TRMCodigo !== m.TRMCodigo) mudancas.set(r.TRMCodigo, [...(mudancas.get(r.TRMCodigo) ?? []), m.MATCodigo]);
      m.TRMCodigo = r.TRMCodigo;
    }

    let vinculadas = 0;
    for (const [trm, matCodigos] of mudancas) {
      const r = await this.prisma.mATMatricula.updateMany({
        where: { INSInstituicaoCodigo: this.ins, MATCodigo: { in: matCodigos } },
        data: { TRMCodigo: trm },
      });
      vinculadas += r.count;
    }

    // TRMQtdePessoas: pessoas distintas com matrícula ativa na turma.
    const pessoasPorTurma = new Map<number, Set<number>>();
    for (const m of matriculas) {
      if (m.TRMCodigo == null) continue;
      const s = pessoasPorTurma.get(m.TRMCodigo) ?? new Set<number>();
      s.add(m.PESCodigo);
      pessoasPorTurma.set(m.TRMCodigo, s);
    }
    const todas = await this.prisma.tRMTurma.findMany({
      where: { INSInstituicaoCodigo: this.ins },
      select: { TRMCodigo: true, TRMQtdePessoas: true },
    });
    for (const t of todas) {
      const qtde = pessoasPorTurma.get(t.TRMCodigo)?.size ?? 0;
      if (qtde !== t.TRMQtdePessoas) {
        await this.prisma.tRMTurma.update({ where: { TRMCodigo: t.TRMCodigo }, data: { TRMQtdePessoas: qtde } });
      }
    }

    if (ambiguas) {
      await this.notificar(
        `turma:${this.ins}:vinculo-ambiguo`,
        'erro',
        `${ambiguas} matrícula(s) aparecem em mais de uma turma no ERP`,
        'Quando o nome da turma na matrícula não desempata, o vínculo atual é mantido; sem vínculo atual, a matrícula fica sem turma ' +
          '(e o aluno sem restrição de horário). Verifique essas matrículas no ERP.',
        'turma_vinculo_ambiguo',
        String(this.ins),
      );
    }

    return {
      matriculasAtivas: matriculas.length,
      matriculasRevinculadas: vinculadas,
      matriculasSemTurma: matriculas.filter((m) => m.TRMCodigo == null).length,
      matriculasAmbiguas: ambiguas,
    };
  }

  // ── virada do ano letivo (§13.5) ─────────────────────────────────────────

  async sugestoesImportacaoAnoAnterior() {
    const [destinos, origens] = await Promise.all([
      this.prisma.tRMTurma.findMany({
        where: { INSInstituicaoCodigo: this.ins, TRMAtiva: true, TRMValidacaoAtiva: false },
        orderBy: [{ TRMCurso: 'asc' }, { TRMSerie: 'asc' }, { TRMTurma: 'asc' }],
      }),
      this.prisma.tRMTurma.findMany({
        where: { INSInstituicaoCodigo: this.ins, TRMAtiva: false, TRMValidacaoAtiva: true, PHACodigo: { not: null } },
        include: {
          escopo: { select: { EQPCodigo: true } },
          perfil: { include: { janelas: { orderBy: { PHJOrdem: 'asc' } } } },
        },
      }),
    ]);

    const ano = (v: string | null) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const origensPorChave = new Map<string, typeof origens>();
    for (const o of origens) {
      const k = chaveCorrespondenciaAnual(o);
      origensPorChave.set(k, [...(origensPorChave.get(k) ?? []), o]);
    }

    const pares: Array<{
      destino: { TRMCodigo: number; rotulo: string; TRMCurso: string | null; TRMQtdePessoas: number };
      origem: { TRMCodigo: number; rotulo: string; PHANome: string; horarios: JanelaEntrada[]; escopo: EscopoEntrada };
    }> = [];
    for (const d of destinos) {
      const candidatas = (origensPorChave.get(chaveCorrespondenciaAnual(d)) ?? [])
        .filter((o) => {
          const ao = ano(o.TRMAnoReferencia);
          const ad = ano(d.TRMAnoReferencia);
          return ao == null || ad == null ? true : ao < ad;
        })
        .sort((a, b) => (ano(b.TRMAnoReferencia) ?? 0) - (ano(a.TRMAnoReferencia) ?? 0));
      const o = candidatas[0];
      if (!o?.perfil) continue;
      pares.push({
        destino: { TRMCodigo: d.TRMCodigo, rotulo: rotuloTurma(d), TRMCurso: d.TRMCurso, TRMQtdePessoas: d.TRMQtdePessoas },
        origem: {
          TRMCodigo: o.TRMCodigo,
          rotulo: rotuloTurma(o),
          PHANome: o.perfil.PHANome,
          horarios: o.perfil.janelas.map(linhaParaJanela),
          escopo: { todos: o.TRMTodosEquipamentos, EQPCodigos: o.escopo.map((e) => e.EQPCodigo) },
        },
      });
    }

    return { turmasSemConfiguracao: destinos.length, pares };
  }

  async importarAnoAnterior(pares: ParImportacao[], origem: Origem) {
    const lista = (Array.isArray(pares) ? pares : []).filter(
      (p) => Number.isInteger(Number(p?.TRMCodigoOrigem)) && Number.isInteger(Number(p?.TRMCodigoDestino)),
    );
    if (!lista.length) throw new TurmaAcessoErro('Informe os pares a importar', 'validacao');

    const turmas = await this.prisma.tRMTurma.findMany({
      where: {
        INSInstituicaoCodigo: this.ins,
        TRMCodigo: { in: lista.flatMap((p) => [Number(p.TRMCodigoOrigem), Number(p.TRMCodigoDestino)]) },
      },
      include: { escopo: { select: { EQPCodigo: true } }, perfil: { include: { janelas: { orderBy: { PHJOrdem: 'asc' } } } } },
    });
    const porCodigo = new Map(turmas.map((t) => [t.TRMCodigo, t]));
    const ativos = new Set((await this.equipamentosDaInstituicao()).filter((e) => e.EQPAtivo).map((e) => e.EQPCodigo));

    // Agrupa destinos com o mesmo horário + escopo: uma gravação (e um sync) por grupo.
    const grupos = new Map<string, { entrada: ValidacaoEntrada; destinos: number[] }>();
    const falhas: Array<{ TRMCodigoDestino: number; erro: string }> = [];
    for (const p of lista) {
      const o = porCodigo.get(Number(p.TRMCodigoOrigem));
      const d = porCodigo.get(Number(p.TRMCodigoDestino));
      if (!o?.perfil || !d) {
        falhas.push({ TRMCodigoDestino: Number(p.TRMCodigoDestino), erro: 'Turma de origem sem configuração ou destino inexistente' });
        continue;
      }
      const horarios = o.perfil.janelas.map(linhaParaJanela);
      const escopo: EscopoEntrada = o.TRMTodosEquipamentos
        ? { todos: true }
        : { todos: false, EQPCodigos: o.escopo.map((e) => e.EQPCodigo).filter((c) => ativos.has(c)) };
      if (!escopo.todos && !escopo.EQPCodigos?.length) {
        falhas.push({ TRMCodigoDestino: d.TRMCodigo, erro: 'Nenhum dos equipamentos da origem está ativo' });
        continue;
      }
      const k = hashEstavel({ h: o.perfil.PHAHashJanelas, escopo });
      const g = grupos.get(k) ?? { entrada: { ativa: true, horarios, escopo }, destinos: [] };
      g.destinos.push(d.TRMCodigo);
      grupos.set(k, g);
    }

    const resultados: ResultadoEquipamento[] = [];
    let importadas = 0;
    for (const g of grupos.values()) {
      try {
        const r = await this.salvarValidacaoEmLote(g.destinos, g.entrada, origem);
        importadas += g.destinos.length;
        resultados.push(...r.resultados);
      } catch (err) {
        for (const d of g.destinos) falhas.push({ TRMCodigoDestino: d, erro: mensagemDe(err) });
      }
    }

    return { importadas, falhas, resultados };
  }

  // ── apoio ────────────────────────────────────────────────────────────────

  private equipamentosDaInstituicao() {
    return this.prisma.eQPEquipamento.findMany({
      where: { INSInstituicaoCodigo: this.ins },
      orderBy: [{ EQPDescricao: 'asc' }, { EQPCodigo: 'asc' }],
    });
  }

  private async mapaSuporte(equipamentos: EQPEquipamento[]) {
    const pares = await Promise.all(
      equipamentos.map(async (e) => [e.EQPCodigo, await this.op.hardware.suporta(e).catch(() => false)] as const),
    );
    return new Map<number, boolean>(pares);
  }

  private async todosPerfis(): Promise<number[]> {
    const perfis = await this.prisma.pHAPerfilHorario.findMany({
      where: { INSInstituicaoCodigo: this.ins },
      select: { PHACodigo: true },
    });
    return perfis.map((p) => p.PHACodigo);
  }

  /** Nomes que um perfil não pode usar: outros perfis e os grupos padrão (PESGrupo) da instituição. */
  private async nomesReservados(excetoPha?: number): Promise<string[]> {
    const [perfis, grupos] = await Promise.all([
      this.prisma.pHAPerfilHorario.findMany({
        where: { INSInstituicaoCodigo: this.ins, ...(excetoPha ? { PHACodigo: { not: excetoPha } } : {}) },
        select: { PHANome: true },
      }),
      this.prisma.pESPessoa.findMany({
        where: { INSInstituicaoCodigo: this.ins, PESGrupo: { not: null } },
        distinct: ['PESGrupo'],
        select: { PESGrupo: true },
      }),
    ]);
    return [...perfis.map((p) => p.PHANome), ...grupos.map((g) => g.PESGrupo ?? '').filter(Boolean)];
  }

  private async obterOuCriarPerfil(horarios: JanelaEntrada[], turno: string | null) {
    const canonico = canonizar(horarios);
    const hash = hashJanelas(canonico);

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const existente = await this.prisma.pHAPerfilHorario.findFirst({
        where: { INSInstituicaoCodigo: this.ins, PHAHashJanelas: hash },
      });
      if (existente) return { perfil: existente, criado: false };

      const nome = sugerirNomePerfil(turno, await this.nomesReservados());
      try {
        const perfil = await this.prisma.$transaction(async (tx) => {
          const criado = await tx.pHAPerfilHorario.create({
            data: { INSInstituicaoCodigo: this.ins, PHANome: nome, PHAHashJanelas: hash, PHAHashConfig: hashConfig(nome, canonico) },
          });
          await tx.pHAJanela.createMany({
            data: horarios.map((j, i) => ({ INSInstituicaoCodigo: this.ins, PHACodigo: criado.PHACodigo, ...janelaParaLinha(j, i + 1) })),
          });
          return criado;
        });
        return { perfil, criado: true };
      } catch (err) {
        // Corrida: outro save criou o mesmo horário ou tomou o nome sugerido — tenta de novo.
        if (!violouUnique(err)) throw err;
      }
    }
    throw new TurmaAcessoErro('Não foi possível criar o perfil de horário (conflito concorrente)', 'conflito');
  }

  private async validarEscopo(escopo: EscopoEntrada, equipamentos: EQPEquipamento[]) {
    if (!escopo || typeof escopo.todos !== 'boolean') {
      throw new TurmaAcessoErro('Informe em quais equipamentos a regra vale', 'validacao');
    }
    const ativos = equipamentos.filter((e) => e.EQPAtivo);

    if (escopo.todos) {
      if (!ativos.length) throw new TurmaAcessoErro('A instituição não tem equipamentos ativos', 'validacao');
      const suporte = await this.mapaSuporte(ativos);
      if (![...suporte.values()].some(Boolean)) {
        throw new TurmaAcessoErro('Nenhum equipamento ativo suporta controle de acesso por turma', 'validacao');
      }
      return { todos: true, EQPCodigos: [] as number[] };
    }

    const codigos = inteiros(escopo.EQPCodigos);
    if (!codigos.length) throw new TurmaAcessoErro('Selecione ao menos um equipamento', 'validacao');

    const porCodigo = new Map(equipamentos.map((e) => [e.EQPCodigo, e]));
    const invalidos = codigos.filter((c) => !porCodigo.get(c)?.EQPAtivo);
    if (invalidos.length) {
      throw new TurmaAcessoErro(`Equipamentos inexistentes ou inativos: ${invalidos.join(', ')}`, 'validacao', {
        EQPCodigos: invalidos,
      });
    }
    const suporte = await this.mapaSuporte(codigos.map((c) => porCodigo.get(c)!));
    const semSuporte = codigos.filter((c) => !suporte.get(c));
    if (semSuporte.length) {
      throw new TurmaAcessoErro(
        `Equipamentos sem suporte a controle por turma: ${semSuporte.map((c) => porCodigo.get(c)?.EQPDescricao ?? c).join(', ')}`,
        'validacao',
        { EQPCodigos: semSuporte },
      );
    }
    return { todos: false, EQPCodigos: codigos };
  }

  private async invalidarPessoasDaTurma(tx: Prisma.TransactionClient, trmCodigo: number, eqpCodigos: number[]) {
    const vinculadas = await tx.pESPessoa.findMany({
      where: { INSInstituicaoCodigo: this.ins, PESTRMCodigo: trmCodigo },
      select: { PESCodigo: true },
    });
    const matriculadas = await tx.mATMatricula.findMany({
      where: { INSInstituicaoCodigo: this.ins, TRMCodigo: trmCodigo, MATAtivo: true },
      select: { PESCodigo: true },
    });
    const pescodigos = [...new Set([...vinculadas, ...matriculadas].map((p) => p.PESCodigo))];
    if (!pescodigos.length) return 0;
    const r = await tx.pESEquipamentoMapeamento.updateMany({
      where: { PESCodigo: { in: pescodigos }, EQPCodigo: { in: eqpCodigos } },
      data: { PEQSyncHash: null, PEQSyncedAt: null },
    });
    return r.count;
  }

  private auditoria(origem: Origem) {
    return {
      USRCodigoAlteracao: origem && 'usuario' in origem ? origem.usuario : null,
      ROTCodigoAlteracao: origem && 'rotina' in origem ? origem.rotina.ROTCodigo : null,
      TRMAlteradoEm: new Date(),
    };
  }

  private resultado(
    eqp: EQPEquipamento,
    perfil: { PHACodigo: number; PHANome: string },
    status: StatusEquipamento,
    mensagem?: string,
  ): ResultadoEquipamento {
    return { EQPCodigo: eqp.EQPCodigo, EQPDescricao: eqp.EQPDescricao, PHACodigo: perfil.PHACodigo, PHANome: perfil.PHANome, status, mensagem };
  }

  private resumir(resultados: ResultadoEquipamento[]) {
    const resumo: Partial<Record<StatusEquipamento, number>> = {};
    for (const r of resultados) resumo[r.status] = (resumo[r.status] ?? 0) + 1;
    return resumo;
  }

  private async notificar(
    ckey: string,
    tipo: string,
    titulo: string,
    conteudo: string,
    origem: string,
    chaveOrigem: string,
  ) {
    try {
      // NOTNotificacao tem trigger (trg_notificacao_enforce_tenant) que exige app.current_tenant
      // na mesma transação — mesmo padrão de controlid.abstract.ts / PrismaService.rls.
      await this.prisma.$transaction([
        this.prisma.$executeRaw`SELECT set_config('app.current_tenant', ${String(this.ins)}, true)`,
        this.prisma.nOTNotificacao.upsert({
          where: { ckey },
          create: { INSInstituicaoCodigo: this.ins, ckey, tipo, titulo, conteudo, origem, chaveOrigem },
          update: { titulo, conteudo },
        }),
      ]);
    } catch (err) {
      this.log('warn', `Falha ao gravar notificação ${ckey}: ${mensagemDe(err)}`);
    }
  }
}

