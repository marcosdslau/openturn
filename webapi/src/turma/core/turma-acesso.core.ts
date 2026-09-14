import type {
  EQPEquipamento,
  EQSEquipamentoSentido,
  PHAJanela,
  PHAPerfilHorario,
  PHEPerfilEquipamento,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  chaveCorrespondenciaAnual,
  diferencaSimetrica,
  elegerTurma,
  hashDesejado,
  noEscopo,
  paraTurmaEstado,
  perfilDeveExistir,
  resolverEscopo,
  resolverTurmaDaMatricula,
  turmaVigente,
  type EquipamentoEstado,
  type TurmaEstado,
} from './estado-desejado';
import { resolverGruposDaPessoa } from './grupo-pessoa';
import { hashEstavel } from './hash-estavel';
import { compararRegras, regrasAplicadas } from './inspecao';
import {
  canonizarRegras,
  hashConfig,
  hashJanelas,
  modoParaDb,
  normalizarRegras,
  regrasDoPerfil,
  regrasParaLinhas,
  validarRegras,
  type CanonicoRegras,
} from './perfil-canonico';
import { normalizarNomePerfil, sugerirNomePerfil, validarNomePerfil } from './perfil-nome';
import type {
  AccessGroupPort,
  HardwareAccessGroupRef,
  HardwareDirectionPortals,
  HostCatraConfig,
  LockPort,
} from './ports';
import {
  TurmaAcessoErro,
  type CatalogoEntrada,
  type EscopoEntrada,
  type JanelaEntrada,
  type Origem,
  type RegrasEntrada,
  type ResultadoEquipamento,
  type StatusEquipamento,
  type ValidacaoEntrada,
} from './tipos';

const LOCK_TTL_MS = 5 * 60_000;
const TIMEOUT_TRANSACAO_MS = 60_000;
const TIMEOUT_IMPORTACAO_MS = 5 * 60_000;
/** Linhas por comando nas gravações em lote do catálogo. */
const TAMANHO_LOTE = 1000;

function emLotes<T>(itens: T[], tamanho = TAMANHO_LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

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

type EquipamentoComSentido = EQPEquipamento & { sentido: EQSEquipamentoSentido | null };
type PerfilParaSync = PHAPerfilHorario & { janelas: PHAJanela[]; equipamentos: PHEPerfilEquipamento[] };

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

function sentidoPreparado(e: { sentido?: EQSEquipamentoSentido | null }): boolean {
  return !!e.sentido?.EQSPortalInternaId && !!e.sentido?.EQSPortalExternaId;
}

function estadoEquipamento(e: EquipamentoComSentido): EquipamentoEstado {
  return { EQPCodigo: e.EQPCodigo, EQPAtivo: e.EQPAtivo, sentidoPreparado: sentidoPreparado(e) };
}

/** Portal de cada sentido, já aplicando a inversão confirmada em bancada. */
function portaisDoEquipamento(s: EQSEquipamentoSentido): HardwareDirectionPortals {
  const a = String(s.EQSPortalInternaId);
  const b = String(s.EQSPortalExternaId);
  return s.EQSInvertido ? { interna: b, externa: a } : { interna: a, externa: b };
}

function refDoPhe(phe: PHEPerfilEquipamento | null | undefined): HardwareAccessGroupRef | undefined {
  if (!phe) return undefined;
  const ou = (v: string | null) => v ?? undefined;
  return {
    groupId: ou(phe.PHEIdGrupo),
    interna: { accessRuleId: ou(phe.PHEIdRegraInterna), timeZoneId: ou(phe.PHEIdHorarioInterna) },
    externa: { accessRuleId: ou(phe.PHEIdRegraExterna), timeZoneId: ou(phe.PHEIdHorarioExterna) },
  };
}

function canonicoDoPerfil(perfil: PHAPerfilHorario & { janelas: PHAJanela[] }): CanonicoRegras {
  return canonizarRegras(regrasDoPerfil(perfil));
}

/** Alertas da leitura de sec_box (SpecControlId.md §3.3). */
function alertasCatra(catra: HostCatraConfig[]): string[] {
  if (!catra.length) return ['Nenhum host do equipamento respondeu à leitura da configuração da catraca'];
  const alertas: string[] = [];
  for (const h of catra) {
    if (h.erro) {
      alertas.push(`${h.host}: não foi possível ler a configuração da catraca (${h.erro})`);
      continue;
    }
    if (h.catra_default_fsm != null && String(h.catra_default_fsm) !== '0') {
      alertas.push(
        `${h.host}: catra_default_fsm = "${h.catra_default_fsm}". Com valor diferente de "0" pelo menos um sentido fica ` +
          'liberado ou bloqueado pelo hardware e as regras de turma não são consultadas nele',
      );
    }
  }
  return alertas;
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
              PHAModoInterna: true,
              PHAModoExterna: true,
              equipamentos: { select: { EQPCodigo: true, PHESyncHash: true, PHEUltimoErro: true } },
            },
          },
        },
        // Controle de acesso ativo primeiro; depois as que estão no ERP; depois ano, curso, série e turma.
        // TRMCodigo no fim deixa a paginação estável entre páginas.
        orderBy: [
          { TRMValidacaoAtiva: 'desc' },
          { TRMAtiva: 'desc' },
          { TRMAnoReferencia: 'desc' },
          { TRMCurso: 'asc' },
          { TRMSerie: 'asc' },
          { TRMTurma: 'asc' },
          { TRMCodigo: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.equipamentosDaInstituicao(),
    ]);

    const ativos = equipamentos.filter((e) => e.EQPAtivo);
    const suporte = await this.mapaSuporte(ativos);
    const preparados = new Set(ativos.filter(sentidoPreparado).map((e) => e.EQPCodigo));
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
      let sync: {
        total: number;
        sincronizados: number;
        pendentes: number;
        erros: number;
        naoSuportados: number;
        semSentido: number;
      } | null = null;
      if (t.TRMValidacaoAtiva && t.perfil) {
        sync = { total: alvo.length, sincronizados: 0, pendentes: 0, erros: 0, naoSuportados: 0, semSentido: 0 };
        for (const eqp of alvo) {
          if (!suporte.get(eqp)) {
            sync.naoSuportados++;
            continue;
          }
          if (!preparados.has(eqp)) {
            sync.semSentido++;
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
          ? {
              PHACodigo: t.perfil.PHACodigo,
              PHANome: t.perfil.PHANome,
              qtdeTurmas: usoPorPerfil.get(t.perfil.PHACodigo) ?? 0,
              modos: { interna: t.perfil.PHAModoInterna.toLowerCase(), externa: t.perfil.PHAModoExterna.toLowerCase() },
            }
          : null,
        escopo: { todos: t.TRMTodosEquipamentos, EQPCodigos: estado.escopo, total: alvo.length },
        sync,
      };
    });

    const semResultado = filtro.busca?.trim() && total === 0 ? await this.explicarBuscaVazia(filtro.busca.trim()) : null;

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) }, semResultado };
  }

  /**
   * Busca sem resultado: a tela Matrículas lê o texto da matrícula (MATTurma), a tela Turmas lê o
   * catálogo do ERP. Explica a diferença — turma só nas matrículas, fora do ERP, ou catálogo ainda
   * não importado — em vez de só dizer "nenhuma turma".
   */
  private async explicarBuscaVazia(q: string) {
    const contem = { contains: q, mode: 'insensitive' as const };
    const termo: Prisma.MATMatriculaWhereInput = { OR: [{ MATTurma: contem }, { MATCurso: contem }, { MATSerie: contem }] };
    const [matriculas, matriculasSemCatalogo, turmasForaDoErp, catalogo] = await Promise.all([
      this.prisma.mATMatricula.count({ where: { INSInstituicaoCodigo: this.ins, MATAtivo: true, ...termo } }),
      this.prisma.mATMatricula.count({ where: { INSInstituicaoCodigo: this.ins, MATAtivo: true, TRMCodigo: null, ...termo } }),
      this.prisma.tRMTurma.count({
        where: {
          INSInstituicaoCodigo: this.ins,
          TRMAtiva: false,
          OR: [{ TRMTurma: contem }, { TRMCurso: contem }, { TRMSerie: contem }],
        },
      }),
      this.prisma.tRMTurma.aggregate({ where: { INSInstituicaoCodigo: this.ins }, _count: { _all: true }, _max: { updatedAt: true } }),
    ]);
    return {
      matriculas,
      matriculasSemCatalogo,
      turmasForaDoErp,
      turmasNoCatalogo: catalogo._count._all,
      catalogoAtualizadoEm: catalogo._max.updatedAt,
    };
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
      regras: turma.perfil ? regrasDoPerfil(turma.perfil) : null,
      /** Forma canônica (dias em minutos) das regras salvas — base do diagrama. */
      canonico: turma.perfil ? canonicoDoPerfil(turma.perfil) : null,
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
        const preparado = sentidoPreparado(e);
        let sync: { status: 'em_dia' | 'pendente' | 'erro'; em: Date | null; erro: string | null } | null = null;
        if (turma.TRMValidacaoAtiva && turma.perfil && alvo.has(e.EQPCodigo) && suporte.get(e.EQPCodigo) && preparado) {
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
          sentido: {
            preparado,
            validado: !!e.sentido?.EQSValidadoEm,
            invertido: !!e.sentido?.EQSInvertido,
          },
          selecionado: estado.escopo.includes(e.EQPCodigo),
          noEscopo: alvo.has(e.EQPCodigo),
          sync,
        };
      }),
    };
  }

  /**
   * Pessoas vinculadas à turma: matrícula ativa ligada a ela no catálogo (o mesmo conjunto contado em
   * TRMQtdePessoas). `comFoto` traz a foto original — a webapi reduz para miniatura antes de responder.
   */
  async listarPessoas(trmCodigo: number, filtro: { busca?: string; page?: number; limit?: number; comFoto?: boolean } = {}) {
    const turma = await this.prisma.tRMTurma.findFirst({
      where: { TRMCodigo: Number(trmCodigo), INSInstituicaoCodigo: this.ins },
      select: { TRMCodigo: true, TRMTurma: true, TRMSerie: true, TRMTurno: true, TRMAnoReferencia: true, TRMCurso: true, TRMQtdePessoas: true },
    });
    if (!turma) throw new TurmaAcessoErro('Turma não encontrada', 'nao_encontrado');

    const page = Math.max(1, Number(filtro.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filtro.limit) || 50));
    const naTurma: Prisma.MATMatriculaWhereInput = { TRMCodigo: turma.TRMCodigo, MATAtivo: true };
    const busca = filtro.busca?.trim();
    const contem = { contains: busca, mode: 'insensitive' as const };
    const where: Prisma.PESPessoaWhereInput = {
      INSInstituicaoCodigo: this.ins,
      deletedAt: null,
      matriculas: { some: naTurma },
      ...(busca
        ? { OR: [{ PESNome: contem }, { PESNomeSocial: contem }, { matriculas: { some: { ...naTurma, MATNumero: contem } } }] }
        : {}),
    };

    const [total, pessoas] = await Promise.all([
      this.prisma.pESPessoa.count({ where }),
      this.prisma.pESPessoa.findMany({
        where,
        select: {
          PESCodigo: true,
          PESNome: true,
          PESNomeSocial: true,
          PESAtivo: true,
          PESFotoExtensao: true,
          PESImageError: true,
          PESFotoBase64: !!filtro.comFoto,
          PESTRMCodigo: true,
          matriculas: { where: naTurma, select: { MATNumero: true }, orderBy: { MATNumero: 'asc' } },
        },
        orderBy: [{ PESNome: 'asc' }, { PESCodigo: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Turma que de fato define o acesso da pessoa (pode ser outra, por prioridade — §7.2).
    const outras = [...new Set(pessoas.map((p) => p.PESTRMCodigo).filter((c): c is number => c != null && c !== turma.TRMCodigo))];
    const rotulos = new Map(
      outras.length
        ? (
            await this.prisma.tRMTurma.findMany({
              where: { INSInstituicaoCodigo: this.ins, TRMCodigo: { in: outras } },
              select: { TRMCodigo: true, TRMTurma: true, TRMSerie: true, TRMTurno: true, TRMAnoReferencia: true },
            })
          ).map((t) => [t.TRMCodigo, rotuloTurma(t)])
        : [],
    );

    return {
      turma: { TRMCodigo: turma.TRMCodigo, rotulo: rotuloTurma(turma), TRMCurso: turma.TRMCurso, TRMQtdePessoas: turma.TRMQtdePessoas },
      data: pessoas.map(({ matriculas, PESTRMCodigo, ...p }) => ({
        ...p,
        matriculas: matriculas.map((m) => m.MATNumero),
        turmaDeAcesso:
          PESTRMCodigo == null
            ? null
            : PESTRMCodigo === turma.TRMCodigo
              ? { TRMCodigo: PESTRMCodigo, estaTurma: true, rotulo: rotuloTurma(turma) }
              : { TRMCodigo: PESTRMCodigo, estaTurma: false, rotulo: rotulos.get(PESTRMCodigo) ?? `Turma ${PESTRMCodigo}` },
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Aba "Perfis de horário" (§13.4): uso, regras e estado nos equipamentos. */
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
      const alvo = equipamentos.filter((e) => perfilDeveExistir(p.PHACodigo, estadoEquipamento(e), turmas));
      const semSentido = equipamentos.filter(
        (e) =>
          e.EQPAtivo &&
          !sentidoPreparado(e) &&
          turmas.some((t) => t.PHACodigo === p.PHACodigo && turmaVigente(t) && noEscopo(t, e.EQPCodigo)),
      ).length;
      const contagem = { total: alvo.length, sincronizados: 0, pendentes: 0, erros: 0, naoSuportados: 0, semSentido };
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
        regras: regrasDoPerfil(p),
        canonico: canonicoDoPerfil(p),
        turmas: vigentes.map((t) => ({ TRMCodigo: t.TRMCodigo, rotulo: rotuloTurma(t) })),
        emUso: vigentes.length > 0,
        equipamentos: contagem,
        removendo,
      };
    });
  }

  /**
   * Mostra, antes de salvar, se as regras caem num perfil existente ou criam um novo (§6.2),
   * e devolve a forma canônica para o diagrama. Aceita `regras` ou o formato anterior (lista de faixas).
   */
  async previewPerfil(regrasOuHorarios: RegrasEntrada | JanelaEntrada[], trmCodigo?: number | null) {
    const regras = Array.isArray(regrasOuHorarios)
      ? normalizarRegras({ horarios: regrasOuHorarios })
      : normalizarRegras({ regras: regrasOuHorarios });
    const vazio = { canonico: null, perfilExistente: null, nomeSugerido: null, perfilAtual: null, mesmoPerfilAtual: false };
    const erros = validarRegras(regras);
    if (erros.length) return { erros, ...vazio };

    const canonico = canonizarRegras(regras!);
    const turma = trmCodigo
      ? await this.prisma.tRMTurma.findFirst({ where: { TRMCodigo: Number(trmCodigo), INSInstituicaoCodigo: this.ins } })
      : null;

    const existente = await this.prisma.pHAPerfilHorario.findFirst({
      where: { INSInstituicaoCodigo: this.ins, PHAHashJanelas: hashJanelas(canonico) },
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
        canonico,
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
      canonico,
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

    let perfilNovo: (PHAPerfilHorario & { janelas: PHAJanela[] }) | null = null;
    let perfilCriado = false;
    let escopoNovo: { todos: boolean; EQPCodigos: number[] } | null = null;

    if (entrada.ativa) {
      const regras = normalizarRegras(entrada);
      const erros = validarRegras(regras);
      if (erros.length) throw new TurmaAcessoErro(`Regra inválida: ${erros.join('; ')}`, 'validacao', { erros });
      escopoNovo = await this.validarEscopo(entrada.escopo, equipamentos);
      const r = await this.obterOuCriarPerfil(regras!, turmas[0].TRMTurno);
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
      perfil: perfilNovo
        ? {
            PHACodigo: perfilNovo.PHACodigo,
            PHANome: perfilNovo.PHANome,
            criado: perfilCriado,
            regras: regrasDoPerfil(perfilNovo),
            canonico: canonicoDoPerfil(perfilNovo),
          }
        : null,
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

    try {
      await this.prisma.pHAPerfilHorario.update({
        where: { PHACodigo: perfil.PHACodigo },
        data: { PHANome: novo, PHAHashConfig: hashConfig(novo, canonicoDoPerfil(perfil)) },
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

  /**
   * Rotina de reconciliação (§12.5): perfis legados, device offline, equipamento novo,
   * perfil sem uso e grupos padrão ausentes.
   */
  async reconciliar(opcoes: { EQPCodigos?: number[] } = {}) {
    const perfisLegadosNormalizados = await this.normalizarPerfisLegados();
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

    return { resumo: this.resumir(resultados), resultados, gruposPadraoAusentes, perfisLegadosNormalizados };
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

    const porEquipamento = new Map<number, Array<{ perfil: PerfilParaSync; canonico: CanonicoRegras }>>();
    for (const perfil of perfis) {
      const canonico = canonicoDoPerfil(perfil);
      for (const eqp of equipamentos) {
        if (filtro.length && !filtro.includes(eqp.EQPCodigo)) continue;
        const temLinha = perfil.equipamentos.some((p) => p.EQPCodigo === eqp.EQPCodigo);
        const emEscopo = turmas.some((t) => t.PHACodigo === perfil.PHACodigo && turmaVigente(t) && noEscopo(t, eqp.EQPCodigo));
        if (!temLinha && !(eqp.EQPAtivo && emEscopo)) continue;
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
    eqp: EquipamentoComSentido,
    perfil: PerfilParaSync,
    canonico: CanonicoRegras,
    turmas: TurmaEstado[],
    forcar: boolean,
  ): Promise<ResultadoEquipamento> {
    const phe = perfil.equipamentos.find((p) => p.EQPCodigo === eqp.EQPCodigo) ?? null;
    const estado = estadoEquipamento(eqp);
    const desejado = hashDesejado(perfil, estado, turmas);
    const ref = refDoPhe(phe);
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
      if (!estado.sentidoPreparado) {
        return this.resultado(
          eqp,
          perfil,
          'sentido_nao_preparado',
          'Prepare a Área Interna e a Área Externa deste equipamento para aplicar a regra por sentido',
        );
      }
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
        const novoRef = await this.op.hardware.sync(
          eqp,
          { codigo: String(perfil.PHACodigo), nome: perfil.PHANome, interna: canonico.interna, externa: canonico.externa },
          ref,
          portaisDoEquipamento(eqp.sentido!),
        );
        await gravar({
          PHEIdGrupo: novoRef.groupId ?? null,
          PHEIdRegraInterna: novoRef.interna?.accessRuleId ?? null,
          PHEIdHorarioInterna: novoRef.interna?.timeZoneId ?? null,
          PHEIdRegraExterna: novoRef.externa?.accessRuleId ?? null,
          PHEIdHorarioExterna: novoRef.externa?.timeZoneId ?? null,
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

  /**
   * O que está DE FATO gravado no equipamento para a turma: lê departamento, regras,
   * portais e horários direto do hardware e compara com a configuração salva.
   */
  async lerRegraAplicada(trmCodigo: number, eqpCodigo: number) {
    const turma = await this.prisma.tRMTurma.findFirst({
      where: { TRMCodigo: Number(trmCodigo), INSInstituicaoCodigo: this.ins },
      include: {
        escopo: { select: { EQPCodigo: true } },
        perfil: { include: { janelas: { orderBy: { PHJOrdem: 'asc' } }, equipamentos: true } },
      },
    });
    if (!turma) throw new TurmaAcessoErro('Turma não encontrada', 'nao_encontrado');
    if (!turma.perfil) throw new TurmaAcessoErro('A turma ainda não tem perfil de horário', 'validacao');

    const eqp = await this.equipamentoComSentido(eqpCodigo);
    if (!sentidoPreparado(eqp)) {
      throw new TurmaAcessoErro('Prepare a Área Interna e a Área Externa deste equipamento antes de ler a regra aplicada', 'validacao');
    }
    if (!(await this.op.hardware.suporta(eqp))) {
      throw new TurmaAcessoErro('Marca/modelo sem suporte a controle de acesso por turma', 'validacao');
    }

    const phe = turma.perfil.equipamentos.find((p) => p.EQPCodigo === eqp.EQPCodigo) ?? null;
    const portais = portaisDoEquipamento(eqp.sentido!);
    let inspecao;
    try {
      inspecao = await this.op.hardware.inspecionar(eqp, refDoPhe(phe) ?? {}, turma.perfil.PHANome);
    } catch (err) {
      throw new TurmaAcessoErro(`Não foi possível ler o equipamento: ${mensagemDe(err)}`, 'equipamento');
    }

    const aplicado = regrasAplicadas(inspecao, portais);
    const deveTer = turmaVigente(paraTurmaEstado(turma)) && noEscopo(paraTurmaEstado(turma), eqp.EQPCodigo);
    const esperado = deveTer ? canonicoDoPerfil(turma.perfil) : null;

    let diferencas: string[];
    if (esperado) {
      diferencas = inspecao.encontrado
        ? compararRegras(esperado, aplicado)
        : [`O departamento ${turma.perfil.PHANome} não existe no equipamento`];
    } else {
      diferencas = inspecao.encontrado
        ? [`A turma não deveria ter regra neste equipamento, mas o departamento ${turma.perfil.PHANome} existe nele`]
        : [];
    }

    return {
      TRMCodigo: turma.TRMCodigo,
      equipamento: { EQPCodigo: eqp.EQPCodigo, EQPDescricao: eqp.EQPDescricao },
      perfil: { PHACodigo: turma.perfil.PHACodigo, PHANome: turma.perfil.PHANome },
      portais,
      invertido: eqp.sentido!.EQSInvertido,
      esperado,
      aplicado: inspecao.encontrado ? aplicado : null,
      diferencas,
      membros: inspecao.membros,
      lidoEm: new Date(),
      inspecao,
    };
  }

  // ── áreas e portais por equipamento (SpecControlId.md §3, §6.1–6.2) ───────

  async listarEquipamentosSentido() {
    const [equipamentos, turmasLinhas] = await Promise.all([
      this.equipamentosDaInstituicao(),
      this.prisma.tRMTurma.findMany({
        where: { INSInstituicaoCodigo: this.ins, TRMValidacaoAtiva: true, TRMAtiva: true, PHACodigo: { not: null } },
        include: { escopo: { select: { EQPCodigo: true } } },
      }),
    ]);
    const suporte = await this.mapaSuporte(equipamentos.filter((e) => e.EQPAtivo));
    const turmas = turmasLinhas.map(paraTurmaEstado);
    return equipamentos.map((e) => ({
      EQPCodigo: e.EQPCodigo,
      EQPDescricao: e.EQPDescricao,
      EQPMarca: e.EQPMarca,
      EQPModelo: e.EQPModelo,
      EQPAtivo: e.EQPAtivo,
      suportado: !!suporte.get(e.EQPCodigo),
      turmasNoEscopo: turmas.filter((t) => noEscopo(t, e.EQPCodigo)).length,
      sentido: this.visaoSentido(e.sentido),
    }));
  }

  /**
   * Cria (ou reconhece) Área Interna, Área Externa e os dois portais no equipamento, lê a
   * configuração da catraca e replica as regras gerais nos portais novos. Idempotente.
   */
  async prepararSentidoEquipamento(eqpCodigo: number, _origem: Origem) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    if (!eqp.EQPAtivo) throw new TurmaAcessoErro('Equipamento inativo', 'validacao');
    if (!(await this.op.hardware.suporta(eqp))) {
      throw new TurmaAcessoErro('Marca/modelo sem suporte a áreas de sentido (disponível para Control iD)', 'validacao');
    }

    const antes = eqp.sentido;
    const eraPreparado = sentidoPreparado(eqp);
    let setup;
    try {
      const r = await this.op.lock.comLock(this.op.chaveLock(this.ins, eqp.EQPCodigo), LOCK_TTL_MS, () =>
        this.op.hardware.prepararSentido(eqp),
      );
      if (r.ocupado) throw new TurmaAcessoErro('Outro processo está alterando este equipamento. Tente em instantes.', 'conflito');
      setup = r.valor;
    } catch (err) {
      if (err instanceof TurmaAcessoErro) throw err;
      const msg = mensagemDe(err);
      await this.prisma.eQSEquipamentoSentido.upsert({
        where: { EQPCodigo: eqp.EQPCodigo },
        create: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo, EQSUltimoErro: msg.slice(0, 1000) },
        update: { EQSUltimoErro: msg.slice(0, 1000) },
      });
      throw new TurmaAcessoErro(`Não foi possível preparar as áreas: ${msg}`, 'equipamento');
    }

    const alertas = alertasCatra(setup.catra);
    const mudouPortais =
      !antes || antes.EQSPortalInternaId !== setup.portalInternaId || antes.EQSPortalExternaId !== setup.portalExternaId;

    const dados = {
      EQSAreaInternaId: setup.areaInternaId,
      EQSAreaExternaId: setup.areaExternaId,
      EQSPortalInternaId: setup.portalInternaId,
      EQSPortalExternaId: setup.portalExternaId,
      EQSCatraConfig: setup.catra as unknown as Prisma.InputJsonValue,
      EQSDiagnostico: {
        criados: setup.criados,
        portaisPreexistentes: setup.portaisPreexistentes,
        regrasReplicadas: setup.regrasReplicadas,
        alertas,
      } as unknown as Prisma.InputJsonValue,
      EQSPreparadoEm: new Date(),
      EQSUltimoErro: null,
      // Portais novos invalidam o teste de bancada e a inversão anteriores.
      ...(mudouPortais && antes ? { EQSValidadoEm: null, USRCodigoValidacao: null, EQSInvertido: false } : {}),
    };
    await this.prisma.eQSEquipamentoSentido.upsert({
      where: { EQPCodigo: eqp.EQPCodigo },
      create: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo, ...dados },
      update: dados,
    });

    if (mudouPortais) {
      await this.prisma.pHEPerfilEquipamento.updateMany({
        where: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo },
        data: { PHESyncHash: null },
      });
    }
    // Recém-preparado: pessoas das turmas vigentes precisam receber o departamento neste equipamento.
    const pessoasInvalidadas = eraPreparado ? 0 : await this.invalidarPessoasDoEquipamento(eqp.EQPCodigo);

    const resultados = await this.sincronizarPerfis(await this.todosPerfis(), { EQPCodigos: [eqp.EQPCodigo] });
    const atualizado = await this.equipamentoComSentido(eqp.EQPCodigo);
    return { sentido: this.visaoSentido(atualizado.sentido), alertas, pessoasInvalidadas, resultados };
  }

  /** Lê do equipamento a configuração da catraca, áreas e portais (diagnóstico, sem alterar nada). */
  async lerSentidoEquipamento(eqpCodigo: number) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    if (!(await this.op.hardware.suporta(eqp))) {
      throw new TurmaAcessoErro('Marca/modelo sem suporte a áreas de sentido', 'validacao');
    }
    let leitura;
    try {
      leitura = await this.op.hardware.lerSentido(eqp);
    } catch (err) {
      throw new TurmaAcessoErro(`Não foi possível ler o equipamento: ${mensagemDe(err)}`, 'equipamento');
    }
    const alertas = alertasCatra(leitura.catra);
    const s = eqp.sentido;
    if (s?.EQSPortalInternaId && !leitura.portais.some((p) => p.id === s.EQSPortalInternaId)) {
      alertas.push('O portal de Entrada na Área Interna registrado não existe mais no equipamento: prepare as áreas novamente');
    }
    if (s?.EQSPortalExternaId && !leitura.portais.some((p) => p.id === s.EQSPortalExternaId)) {
      alertas.push('O portal de Entrada na Área Externa registrado não existe mais no equipamento: prepare as áreas novamente');
    }
    return { sentido: this.visaoSentido(s), leitura, alertas };
  }

  /** Inversão dos portais (resultado do teste em bancada) e marcação de validação. */
  async atualizarSentidoEquipamento(eqpCodigo: number, dados: { invertido?: boolean; validado?: boolean }, origem: Origem) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    if (!sentidoPreparado(eqp)) throw new TurmaAcessoErro('Prepare as áreas deste equipamento primeiro', 'validacao');
    const s = eqp.sentido!;

    const data: Prisma.EQSEquipamentoSentidoUpdateInput = {};
    const inverteu = typeof dados?.invertido === 'boolean' && dados.invertido !== s.EQSInvertido;
    if (inverteu) {
      data.EQSInvertido = dados.invertido;
      data.EQSValidadoEm = null;
      data.usuarioValidacao = { disconnect: true };
    }
    if (typeof dados?.validado === 'boolean') {
      data.EQSValidadoEm = dados.validado ? new Date() : null;
      data.usuarioValidacao =
        dados.validado && origem && 'usuario' in origem ? { connect: { USRCodigo: origem.usuario } } : { disconnect: true };
    }
    await this.prisma.eQSEquipamentoSentido.update({ where: { EQPCodigo: eqp.EQPCodigo }, data });

    let resultados: ResultadoEquipamento[] = [];
    if (inverteu) {
      await this.prisma.pHEPerfilEquipamento.updateMany({
        where: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo },
        data: { PHESyncHash: null },
      });
      resultados = await this.sincronizarPerfis(await this.todosPerfis(), { EQPCodigos: [eqp.EQPCodigo] });
    }
    const atualizado = await this.equipamentoComSentido(eqp.EQPCodigo);
    return { sentido: this.visaoSentido(atualizado.sentido), resultados };
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

    // Tudo numa transação e em lote: com milhares de turmas e banco remoto, gravar uma a uma
    // levava minutos e deixava a tela Turmas com o catálogo pela metade enquanto a rotina rodava.
    const r = await this.prisma.$transaction(
      async (tx) => {
        const existentes = await tx.tRMTurma.findMany({ where: { INSInstituicaoCodigo: this.ins } });
        const porIdExterno = new Map(existentes.map((t) => [t.TRMIdExterno, t]));

        const novas: Prisma.TRMTurmaCreateManyInput[] = [];
        const alteradas: Array<Record<string, unknown>> = [];
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
            novas.push({ INSInstituicaoCodigo: this.ins, TRMIdExterno: idExterno, ...dados });
            continue;
          }
          const mudou = (Object.keys(dados) as Array<keyof typeof dados>).some((k) => {
            const a = atual[k] instanceof Date ? (atual[k] as Date).getTime() : atual[k];
            const b = dados[k] instanceof Date ? (dados[k] as Date).getTime() : dados[k];
            return (a ?? null) !== (b ?? null);
          });
          if (mudou) alteradas.push({ TRMCodigo: atual.TRMCodigo, ...dados });
        }

        let criadas = 0;
        for (const lote of emLotes(novas)) {
          criadas += (await tx.tRMTurma.createMany({ data: lote, skipDuplicates: true })).count;
        }
        for (const lote of emLotes(alteradas)) {
          await tx.$executeRawUnsafe(
            `UPDATE "TRMTurma" t SET
               "TRMIdOferta" = v."TRMIdOferta", "TRMTurma" = v."TRMTurma", "TRMCurso" = v."TRMCurso",
               "TRMSerie" = v."TRMSerie", "TRMCurriculo" = v."TRMCurriculo", "TRMTurno" = v."TRMTurno",
               "TRMAnoReferencia" = v."TRMAnoReferencia", "TRMCalendario" = v."TRMCalendario",
               "TRMDataInicio" = v."TRMDataInicio", "TRMDataFim" = v."TRMDataFim", "TRMAtiva" = v."TRMAtiva",
               "updatedAt" = (now() AT TIME ZONE 'UTC')
             FROM jsonb_to_recordset($1::jsonb) AS v(
               "TRMCodigo" int, "TRMIdOferta" text, "TRMTurma" text, "TRMCurso" text, "TRMSerie" text,
               "TRMCurriculo" text, "TRMTurno" text, "TRMAnoReferencia" text, "TRMCalendario" text,
               "TRMDataInicio" timestamp(3), "TRMDataFim" timestamp(3), "TRMAtiva" boolean)
             WHERE t."TRMCodigo" = v."TRMCodigo" AND t."INSInstituicaoCodigo" = $2`,
            JSON.stringify(lote),
            this.ins,
          );
        }

        const saindo = existentes.filter((t) => t.TRMAtiva && !vistas.has(t.TRMIdExterno));
        if (saindo.length) {
          await tx.tRMTurma.updateMany({
            where: { INSInstituicaoCodigo: this.ins, TRMCodigo: { in: saindo.map((t) => t.TRMCodigo) } },
            data: { TRMAtiva: false },
          });
        }

        const vinculo = await this.vincularMatriculas(tx, entrada.matriculasPorTurma ?? {});
        return { criadas, atualizadas: alteradas.length, saindo, vinculo };
      },
      { timeout: TIMEOUT_IMPORTACAO_MS, maxWait: TIMEOUT_TRANSACAO_MS },
    );

    // Notificações só depois do commit.
    if (r.vinculo.matriculasAmbiguas) {
      await this.notificar(
        `turma:${this.ins}:vinculo-ambiguo`,
        'erro',
        `${r.vinculo.matriculasAmbiguas} matrícula(s) aparecem em mais de uma turma no ERP`,
        'Quando o nome da turma na matrícula não desempata, o vínculo atual é mantido; sem vínculo atual, a matrícula fica sem turma ' +
          '(e o aluno sem restrição de horário). Verifique essas matrículas no ERP.',
        'turma_vinculo_ambiguo',
        String(this.ins),
      );
    }
    const configuradasSaindo = r.saindo.filter((t) => t.TRMValidacaoAtiva);
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
      criadas: r.criadas,
      atualizadas: r.atualizadas,
      desativadas: r.saindo.length,
      ...r.vinculo,
    };
  }

  private async vincularMatriculas(tx: Prisma.TransactionClient, matriculasPorTurma: Record<string, Array<string | number>>) {
    const turmasAtivas = await tx.tRMTurma.findMany({
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

    const matriculas = await tx.mATMatricula.findMany({
      where: { INSInstituicaoCodigo: this.ins, MATAtivo: true },
      select: { MATCodigo: true, MATNumero: true, MATTurma: true, TRMCodigo: true, PESCodigo: true, pessoa: { select: { deletedAt: true } } },
    });

    const mudancas: Array<{ MATCodigo: number; TRMCodigo: number | null }> = [];
    let ambiguas = 0;
    for (const m of matriculas) {
      const r = resolverTurmaDaMatricula(m, candidatas.get(String(m.MATNumero)) ?? []);
      if (r.ambiguo) ambiguas++;
      if (r.TRMCodigo !== m.TRMCodigo) mudancas.push({ MATCodigo: m.MATCodigo, TRMCodigo: r.TRMCodigo });
      m.TRMCodigo = r.TRMCodigo;
    }

    let vinculadas = 0;
    for (const lote of emLotes(mudancas)) {
      vinculadas += await tx.$executeRawUnsafe(
        `UPDATE "MATMatricula" m SET "TRMCodigo" = v."TRMCodigo"
         FROM jsonb_to_recordset($1::jsonb) AS v("MATCodigo" int, "TRMCodigo" int)
         WHERE m."MATCodigo" = v."MATCodigo" AND m."INSInstituicaoCodigo" = $2`,
        JSON.stringify(lote),
        this.ins,
      );
    }

    // TRMQtdePessoas: pessoas distintas com matrícula ativa na turma.
    const pessoasPorTurma = new Map<number, Set<number>>();
    for (const m of matriculas) {
      if (m.TRMCodigo == null || m.pessoa.deletedAt) continue;
      const s = pessoasPorTurma.get(m.TRMCodigo) ?? new Set<number>();
      s.add(m.PESCodigo);
      pessoasPorTurma.set(m.TRMCodigo, s);
    }
    const todas = await tx.tRMTurma.findMany({
      where: { INSInstituicaoCodigo: this.ins },
      select: { TRMCodigo: true, TRMQtdePessoas: true },
    });
    const contagens = todas
      .map((t) => ({ TRMCodigo: t.TRMCodigo, qtde: pessoasPorTurma.get(t.TRMCodigo)?.size ?? 0, antes: t.TRMQtdePessoas }))
      .filter((t) => t.qtde !== t.antes)
      .map(({ TRMCodigo, qtde }) => ({ TRMCodigo, qtde }));
    for (const lote of emLotes(contagens)) {
      await tx.$executeRawUnsafe(
        `UPDATE "TRMTurma" t SET "TRMQtdePessoas" = v.qtde, "updatedAt" = (now() AT TIME ZONE 'UTC')
         FROM jsonb_to_recordset($1::jsonb) AS v("TRMCodigo" int, qtde int)
         WHERE t."TRMCodigo" = v."TRMCodigo" AND t."INSInstituicaoCodigo" = $2`,
        JSON.stringify(lote),
        this.ins,
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
      origem: {
        TRMCodigo: number;
        rotulo: string;
        PHANome: string;
        regras: RegrasEntrada;
        canonico: CanonicoRegras;
        escopo: EscopoEntrada;
      };
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
          regras: regrasDoPerfil(o.perfil),
          canonico: canonicoDoPerfil(o.perfil),
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

    // Agrupa destinos com as mesmas regras + escopo: uma gravação (e um sync) por grupo.
    const grupos = new Map<string, { entrada: ValidacaoEntrada; destinos: number[] }>();
    const falhas: Array<{ TRMCodigoDestino: number; erro: string }> = [];
    for (const p of lista) {
      const o = porCodigo.get(Number(p.TRMCodigoOrigem));
      const d = porCodigo.get(Number(p.TRMCodigoDestino));
      if (!o?.perfil || !d) {
        falhas.push({ TRMCodigoDestino: Number(p.TRMCodigoDestino), erro: 'Turma de origem sem configuração ou destino inexistente' });
        continue;
      }
      const regras = regrasDoPerfil(o.perfil);
      const escopo: EscopoEntrada = o.TRMTodosEquipamentos
        ? { todos: true }
        : { todos: false, EQPCodigos: o.escopo.map((e) => e.EQPCodigo).filter((c) => ativos.has(c)) };
      if (!escopo.todos && !escopo.EQPCodigos?.length) {
        falhas.push({ TRMCodigoDestino: d.TRMCodigo, erro: 'Nenhum dos equipamentos da origem está ativo' });
        continue;
      }
      const k = hashEstavel({ h: o.perfil.PHAHashJanelas, escopo });
      const g = grupos.get(k) ?? { entrada: { ativa: true, regras, escopo }, destinos: [] };
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

  private equipamentosDaInstituicao(): Promise<EquipamentoComSentido[]> {
    return this.prisma.eQPEquipamento.findMany({
      where: { INSInstituicaoCodigo: this.ins },
      include: { sentido: true },
      orderBy: [{ EQPDescricao: 'asc' }, { EQPCodigo: 'asc' }],
    });
  }

  private async equipamentoComSentido(eqpCodigo: number): Promise<EquipamentoComSentido> {
    const eqp = await this.prisma.eQPEquipamento.findFirst({
      where: { EQPCodigo: Number(eqpCodigo), INSInstituicaoCodigo: this.ins },
      include: { sentido: true },
    });
    if (!eqp) throw new TurmaAcessoErro('Equipamento não encontrado', 'nao_encontrado');
    return eqp;
  }

  private visaoSentido(s: EQSEquipamentoSentido | null) {
    if (!s) return { preparado: false, invertido: false, validadoEm: null, preparadoEm: null, portais: null, areas: null, catra: null, diagnostico: null, ultimoErro: null };
    const preparado = !!s.EQSPortalInternaId && !!s.EQSPortalExternaId;
    return {
      preparado,
      invertido: s.EQSInvertido,
      validadoEm: s.EQSValidadoEm,
      preparadoEm: s.EQSPreparadoEm,
      portais: preparado ? portaisDoEquipamento(s) : null,
      areas: s.EQSAreaInternaId ? { interna: s.EQSAreaInternaId, externa: s.EQSAreaExternaId } : null,
      catra: (s.EQSCatraConfig as unknown as HostCatraConfig[] | null) ?? null,
      diagnostico: (s.EQSDiagnostico as Record<string, unknown> | null) ?? null,
      ultimoErro: s.EQSUltimoErro,
    };
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

  private async obterOuCriarPerfil(regras: RegrasEntrada, turno: string | null) {
    const canonico = canonizarRegras(regras);
    const hash = hashJanelas(canonico);

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const existente = await this.prisma.pHAPerfilHorario.findFirst({
        where: { INSInstituicaoCodigo: this.ins, PHAHashJanelas: hash },
        include: { janelas: { orderBy: { PHJOrdem: 'asc' } } },
      });
      if (existente) return { perfil: existente, criado: false };

      const nome = sugerirNomePerfil(turno, await this.nomesReservados());
      try {
        const perfil = await this.prisma.$transaction(async (tx) => {
          const criado = await tx.pHAPerfilHorario.create({
            data: {
              INSInstituicaoCodigo: this.ins,
              PHANome: nome,
              PHAHashJanelas: hash,
              PHAHashConfig: hashConfig(nome, canonico),
              PHAModoInterna: modoParaDb(regras.interna.modo),
              PHAModoExterna: modoParaDb(regras.externa.modo),
            },
          });
          const linhas = regrasParaLinhas(regras);
          if (linhas.length) {
            await tx.pHAJanela.createMany({
              data: linhas.map((l) => ({ INSInstituicaoCodigo: this.ins, PHACodigo: criado.PHACodigo, ...l })),
            });
          }
          return tx.pHAPerfilHorario.findUniqueOrThrow({
            where: { PHACodigo: criado.PHACodigo },
            include: { janelas: { orderBy: { PHJOrdem: 'asc' } } },
          });
        });
        return { perfil, criado: true };
      } catch (err) {
        // Corrida: outro save criou as mesmas regras ou tomou o nome sugerido — tenta de novo.
        if (!violouUnique(err)) throw err;
      }
    }
    throw new TurmaAcessoErro('Não foi possível criar o perfil de horário (conflito concorrente)', 'conflito');
  }

  private async validarEscopo(escopo: EscopoEntrada, equipamentos: EquipamentoComSentido[]) {
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
      if (!ativos.some((e) => suporte.get(e.EQPCodigo) && sentidoPreparado(e))) {
        throw new TurmaAcessoErro(
          'Nenhum equipamento tem a Área Interna e a Área Externa preparadas. Prepare as áreas na aba Equipamentos.',
          'validacao',
        );
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
    const nome = (c: number) => porCodigo.get(c)?.EQPDescricao ?? String(c);
    const suporte = await this.mapaSuporte(codigos.map((c) => porCodigo.get(c)!));
    const semSuporte = codigos.filter((c) => !suporte.get(c));
    if (semSuporte.length) {
      throw new TurmaAcessoErro(`Equipamentos sem suporte a controle por turma: ${semSuporte.map(nome).join(', ')}`, 'validacao', {
        EQPCodigos: semSuporte,
      });
    }
    const semSentido = codigos.filter((c) => !sentidoPreparado(porCodigo.get(c)!));
    if (semSentido.length) {
      throw new TurmaAcessoErro(
        `Prepare a Área Interna e a Área Externa antes de selecionar: ${semSentido.map(nome).join(', ')}`,
        'validacao',
        { EQPCodigos: semSentido },
      );
    }
    return { todos: false, EQPCodigos: codigos };
  }

  /**
   * Perfis migrados do formato anterior ao controle por sentido ficam com hash provisório
   * ('legado-<código>'). Recalcula quando não houver outro perfil com as mesmas regras.
   */
  private async normalizarPerfisLegados(): Promise<number> {
    const legados = await this.prisma.pHAPerfilHorario.findMany({
      where: { INSInstituicaoCodigo: this.ins, PHAHashJanelas: { startsWith: 'legado-' } },
      include: { janelas: { orderBy: { PHJOrdem: 'asc' } } },
    });
    let normalizados = 0;
    for (const p of legados) {
      const regras = regrasDoPerfil(p);
      if (validarRegras(regras).length) continue;
      const canonico = canonizarRegras(regras);
      const hash = hashJanelas(canonico);
      const duplicado = await this.prisma.pHAPerfilHorario.findFirst({
        where: { INSInstituicaoCodigo: this.ins, PHAHashJanelas: hash, PHACodigo: { not: p.PHACodigo } },
        select: { PHACodigo: true },
      });
      if (duplicado) continue;
      try {
        await this.prisma.pHAPerfilHorario.update({
          where: { PHACodigo: p.PHACodigo },
          data: { PHAHashJanelas: hash, PHAHashConfig: hashConfig(p.PHANome, canonico) },
        });
        normalizados++;
      } catch (err) {
        if (!violouUnique(err)) throw err;
      }
    }
    return normalizados;
  }

  /** Pessoas das turmas vigentes com o equipamento no escopo: reenfileira nele (usado ao preparar as áreas). */
  private async invalidarPessoasDoEquipamento(eqpCodigo: number): Promise<number> {
    const turmas = await this.prisma.tRMTurma.findMany({
      where: {
        INSInstituicaoCodigo: this.ins,
        TRMValidacaoAtiva: true,
        TRMAtiva: true,
        PHACodigo: { not: null },
        OR: [{ TRMTodosEquipamentos: true }, { escopo: { some: { EQPCodigo: eqpCodigo } } }],
      },
      select: { TRMCodigo: true },
    });
    if (!turmas.length) return 0;
    const pessoas = await this.prisma.pESPessoa.findMany({
      where: { INSInstituicaoCodigo: this.ins, PESTRMCodigo: { in: turmas.map((t) => t.TRMCodigo) } },
      select: { PESCodigo: true },
    });
    if (!pessoas.length) return 0;
    const r = await this.prisma.pESEquipamentoMapeamento.updateMany({
      where: { PESCodigo: { in: pessoas.map((p) => p.PESCodigo) }, EQPCodigo: eqpCodigo },
      data: { PEQSyncHash: null, PEQSyncedAt: null },
    });
    return r.count;
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
