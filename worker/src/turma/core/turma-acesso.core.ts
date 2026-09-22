// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/turma-acesso.core.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { EQPEquipamento, Prisma, PrismaClient } from '@prisma/client';
import {
  chaveCorrespondenciaAnual,
  diferencaSimetrica,
  elegerTurma,
  noEscopo,
  paraTurmaEstado,
  resolverEscopo,
  resolverTurmaDaMatricula,
  type TurmaEstado,
} from './estado-desejado';
import {
  atualizarHorario,
  criarArea,
  criarHorario,
  criarPortal,
  removerHorario,
  renomearArea,
  type ContextoAcesso,
  type JanelaDevice,
} from './acesso-equipamento.core';
import {
  adotarDepartamento,
  candidatosDepartamento,
  criarDepartamento,
  desadotarDepartamento,
  renomearDepartamento,
  revisarDepartamento,
  salvarRegrasDepartamento,
  type RegraDesejada,
} from './acesso-departamento.core';
import { lerEquipamento, type ResumoEspelho } from './espelho';
import { compararHosts, type ComparacaoHosts } from './hosts-acesso';
import { resolverGruposDaPessoa } from './grupo-pessoa';
import type { AccessGroupPort, LockPort } from './ports';
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
  departamento?: number;
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

/** Portal de cada sentido, já aplicando a inversão confirmada em bancada. */
/** Alertas da leitura de sec_box (SpecControlId.md §3.3). */
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
    if (filtro.departamento) and.push({ DEPCodigo: Number(filtro.departamento) });
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
          departamento: {
            select: {
              DEPCodigo: true,
              DEPNome: true,
              equipamentos: {
                select: { EQPCodigo: true, DEQNome: true, DEQRevisadoEm: true, DEQUltimoErro: true, _count: { select: { regras: true } } },
              },
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
    const ativosCodigos = ativos.map((e) => e.EQPCodigo);

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
      if (t.TRMValidacaoAtiva && t.departamento) {
        // Modelo novo: "em dia" = departamento adotado, com regra e conferido. `semSentido` passa a
        // contar equipamento sem adoção — é o mesmo sintoma para a tela: a regra não vale lá.
        sync = { total: alvo.length, sincronizados: 0, pendentes: 0, erros: 0, naoSuportados: 0, semSentido: 0 };
        const adotados = new Map(t.departamento.equipamentos.map((d) => [d.EQPCodigo, d]));
        for (const eqp of alvo) {
          if (!suporte.get(eqp)) {
            sync.naoSuportados++;
            continue;
          }
          const deq = adotados.get(eqp);
          if (!deq) sync.semSentido++;
          else if (deq.DEQUltimoErro) sync.erros++;
          else if (!deq._count.regras || !deq.DEQRevisadoEm) sync.pendentes++;
          else sync.sincronizados++;
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
        departamento: t.departamento
          ? {
              DEPCodigo: t.departamento.DEPCodigo,
              DEPNome: t.departamento.DEPNome,
              adotadoEm: t.departamento.equipamentos.length,
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
    const [turmas, departamentos, equipamentos] = await Promise.all([
      this.prisma.tRMTurma.findMany({
        where: { INSInstituicaoCodigo: this.ins, TRMAtiva: true },
        select: { TRMAnoReferencia: true, TRMCurso: true, TRMSerie: true, TRMTurno: true },
      }),
      this.prisma.dEPDepartamento.findMany({
        where: { INSInstituicaoCodigo: this.ins },
        select: { DEPCodigo: true, DEPNome: true },
        orderBy: { DEPNome: 'asc' },
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
      equipamentos,
    };
  }

  /** Departamentos da instituição, com onde estão adotados e quantas turmas os usam. */
  async listarDepartamentos() {
    const deps = await this.prisma.dEPDepartamento.findMany({
      where: { INSInstituicaoCodigo: this.ins },
      include: {
        equipamentos: {
          select: {
            EQPCodigo: true,
            DEQNome: true,
            DEQRevisadoEm: true,
            DEQUltimoErro: true,
            _count: { select: { regras: true } },
            equipamento: { select: { EQPDescricao: true, EQPAtivo: true } },
          },
        },
        turmas: { select: { TRMCodigo: true, TRMTurma: true, TRMCurso: true, TRMSerie: true, TRMTurno: true, TRMAnoReferencia: true, TRMValidacaoAtiva: true } },
      },
      orderBy: { DEPNome: 'asc' },
    });

    return deps.map((d) => ({
      DEPCodigo: d.DEPCodigo,
      DEPNome: d.DEPNome,
      DEPDescricao: d.DEPDescricao,
      equipamentos: d.equipamentos.map((e) => ({
        EQPCodigo: e.EQPCodigo,
        EQPDescricao: e.equipamento.EQPDescricao,
        EQPAtivo: e.equipamento.EQPAtivo,
        nome: e.DEQNome,
        revisado: !!e.DEQRevisadoEm,
        regras: e._count.regras,
        erro: e.DEQUltimoErro,
      })),
      turmas: d.turmas.filter((t) => t.TRMValidacaoAtiva).map(rotuloTurma),
      qtdeTurmas: d.turmas.filter((t) => t.TRMValidacaoAtiva).length,
    }));
  }

  async obter(trmCodigo: number) {
    const turma = await this.prisma.tRMTurma.findFirst({
      where: { TRMCodigo: Number(trmCodigo), INSInstituicaoCodigo: this.ins },
      include: {
        escopo: { select: { EQPCodigo: true } },
        usuarioAlteracao: { select: { USRNome: true } },
        departamento: {
          select: {
            DEPCodigo: true,
            DEPNome: true,
            equipamentos: {
              select: { EQPCodigo: true, DEQNome: true, DEQRevisadoEm: true, DEQUltimoErro: true, _count: { select: { regras: true } } },
            },
            turmas: { select: { TRMCodigo: true, TRMTurma: true, TRMCurso: true, TRMSerie: true, TRMTurno: true, TRMAnoReferencia: true } },
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
      departamento: turma.departamento
        ? {
            DEPCodigo: turma.departamento.DEPCodigo,
            DEPNome: turma.departamento.DEPNome,
            outrasTurmas: turma.departamento.turmas.filter((t) => t.TRMCodigo !== turma.TRMCodigo).map(rotuloTurma),
          }
        : null,
      escopo: { todos: turma.TRMTodosEquipamentos, EQPCodigos: estado.escopo },
      equipamentos: equipamentos.map((e) => {
        const deq = turma.departamento?.equipamentos.find((d) => d.EQPCodigo === e.EQPCodigo);
        // "em dia" no modelo novo: adotado, com regra e conferido por alguém.
        let sync: { status: 'em_dia' | 'pendente' | 'erro'; em: Date | null; erro: string | null } | null = null;
        if (turma.TRMValidacaoAtiva && turma.departamento && alvo.has(e.EQPCodigo) && suporte.get(e.EQPCodigo)) {
          const emDia = !!deq && !!deq._count.regras && !!deq.DEQRevisadoEm && !deq.DEQUltimoErro;
          sync = {
            status: deq?.DEQUltimoErro ? 'erro' : emDia ? 'em_dia' : 'pendente',
            em: deq?.DEQRevisadoEm ?? null,
            erro: deq?.DEQUltimoErro ?? null,
          };
        }
        return {
          EQPCodigo: e.EQPCodigo,
          EQPDescricao: e.EQPDescricao,
          EQPMarca: e.EQPMarca,
          EQPModelo: e.EQPModelo,
          EQPAtivo: e.EQPAtivo,
          suportado: !!suporte.get(e.EQPCodigo),
          /** Situação do departamento da turma neste equipamento (null = fora do escopo). */
          departamento:
            turma.departamento && alvo.has(e.EQPCodigo)
              ? {
                  adotado: !!deq,
                  nome: deq?.DEQNome ?? null,
                  revisado: !!deq?.DEQRevisadoEm,
                  regras: deq?._count.regras ?? 0,
                  erro: deq?.DEQUltimoErro ?? null,
                }
              : null,
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

  // ── gravação ─────────────────────────────────────────────────────────────

  async salvarValidacao(trmCodigo: number, entrada: ValidacaoEntrada, origem: Origem) {
    return this.salvarValidacaoEmLote([trmCodigo], entrada, origem);
  }

  /**
   * Ativa/desativa o controle da turma. A turma só escolhe DEPARTAMENTO e ESCOPO — horários, áreas
   * e regras são configurados por equipamento e vêm do departamento.
   *
   * Não escreve nada em catraca: o departamento já existe lá (foi criado ou adotado na tela do
   * equipamento). O que muda aqui é quem entra em qual grupo, e isso vai pela rotina de vínculo.
   */
  async salvarValidacaoEmLote(trmCodigos: number[], entrada: ValidacaoEntrada, origem: Origem) {
    const codigos = inteiros(trmCodigos);
    if (!codigos.length) throw new TurmaAcessoErro('Informe ao menos uma turma', 'validacao');
    if (!entrada || typeof entrada.ativa !== 'boolean') {
      throw new TurmaAcessoErro('Informe se a validação está ativa', 'validacao');
    }
    const legado = entrada as { regras?: unknown; horarios?: unknown };
    if (legado.regras || legado.horarios) {
      throw new TurmaAcessoErro(
        'Horário na turma não existe mais. Configure áreas, horários e regras no equipamento ' +
          '(Equipamentos → Configuração) e informe aqui apenas `DEPCodigo`.',
        'validacao',
      );
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

    let departamento: { DEPCodigo: number; DEPNome: string } | null = null;
    let escopoNovo: { todos: boolean; EQPCodigos: number[] } | null = null;

    if (entrada.ativa) {
      if (!Number.isInteger(Number(entrada.DEPCodigo))) {
        throw new TurmaAcessoErro('Informe o departamento da turma', 'validacao');
      }
      const dep = await this.prisma.dEPDepartamento.findFirst({
        where: { DEPCodigo: Number(entrada.DEPCodigo), INSInstituicaoCodigo: this.ins },
        select: { DEPCodigo: true, DEPNome: true },
      });
      if (!dep) throw new TurmaAcessoErro('Departamento não encontrado', 'nao_encontrado');
      departamento = dep;
      escopoNovo = await this.validarEscopo(entrada.escopo, equipamentos);
    }

    let pessoasInvalidadas = 0;
    const auditoria = this.auditoria(origem);

    await this.prisma.$transaction(
      async (tx) => {
        for (const turma of turmas) {
          const antes = paraTurmaEstado(turma);

          if (!entrada.ativa) {
            // Desativar preserva departamento e escopo: a tela reabre com a última configuração.
            await tx.tRMTurma.update({ where: { TRMCodigo: turma.TRMCodigo }, data: { TRMValidacaoAtiva: false, ...auditoria } });
            continue;
          }

          await tx.tRMTurma.update({
            where: { TRMCodigo: turma.TRMCodigo },
            data: {
              DEPCodigo: departamento!.DEPCodigo,
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

          // Trocar de departamento muda o nome do grupo da pessoa, mas não move PESPessoa.updatedAt:
          // sem invalidar, o envio seguinte acharia que já está em dia.
          const trocouDepartamento = antes.DEPCodigo !== departamento!.DEPCodigo;
          const escopoAntes = antes.TRMValidacaoAtiva ? resolverEscopo(antes, ativosCodigos) : [];
          const escopoDepois = resolverEscopo(
            { TRMTodosEquipamentos: escopoNovo!.todos, escopo: escopoNovo!.EQPCodigos },
            ativosCodigos,
          );
          const afetados = trocouDepartamento
            ? [...new Set([...escopoAntes, ...escopoDepois])]
            : diferencaSimetrica(escopoAntes, escopoDepois);
          if (afetados.length) pessoasInvalidadas += await this.invalidarPessoasDaTurma(tx, turma.TRMCodigo, afetados);
        }
      },
      { timeout: TIMEOUT_TRANSACAO_MS },
    );

    const resultados = entrada.ativa ? await this.verificarDepartamentos({ TRMCodigos: codigos }) : [];

    return {
      TRMCodigos: codigos,
      ativa: entrada.ativa,
      departamento,
      pessoasInvalidadas,
      resultados,
    };
  }

  /**
   * Situação do departamento de cada turma em cada equipamento do escopo. Só consulta o espelho —
   * para confrontar com o que está gravado na catraca, use `POST /acesso/ler` antes.
   */
  async verificarDepartamentos(opcoes: { TRMCodigos?: number[]; DEPCodigos?: number[] } = {}): Promise<ResultadoEquipamento[]> {
    const where: Prisma.TRMTurmaWhereInput = {
      INSInstituicaoCodigo: this.ins,
      TRMValidacaoAtiva: true,
      TRMAtiva: true,
      DEPCodigo: { not: null },
    };
    const trm = inteiros(opcoes.TRMCodigos);
    if (trm.length) where.TRMCodigo = { in: trm };
    const dep = inteiros(opcoes.DEPCodigos);
    if (dep.length) where.DEPCodigo = { in: dep };

    const [turmas, equipamentos] = await Promise.all([
      this.prisma.tRMTurma.findMany({
        where,
        include: {
          escopo: { select: { EQPCodigo: true } },
          departamento: {
            select: {
              DEPCodigo: true,
              DEPNome: true,
              equipamentos: {
                select: { EQPCodigo: true, DEQNome: true, DEQRevisadoEm: true, DEQUltimoErro: true, _count: { select: { regras: true } } },
              },
            },
          },
        },
      }),
      this.equipamentosDaInstituicao(),
    ]);
    if (!turmas.length) return [];

    const suporte = await this.mapaSuporte(equipamentos.filter((e) => e.EQPAtivo));
    const resultados: ResultadoEquipamento[] = [];

    for (const turma of turmas) {
      const estado = paraTurmaEstado(turma);
      const adotados = new Map(
        (turma.departamento?.equipamentos ?? []).map((d) => [d.EQPCodigo, d]),
      );
      for (const eqp of equipamentos) {
        if (!noEscopo(estado, eqp.EQPCodigo)) continue;

        const base = {
          EQPCodigo: eqp.EQPCodigo,
          EQPDescricao: eqp.EQPDescricao,
          PHACodigo: turma.departamento!.DEPCodigo,
          PHANome: turma.departamento!.DEPNome,
        };
        if (!eqp.EQPAtivo) {
          resultados.push({ ...base, status: 'inativo' });
          continue;
        }
        if (!suporte.get(eqp.EQPCodigo)) {
          resultados.push({ ...base, status: 'nao_suportado', mensagem: 'Marca/modelo sem suporte a departamentos' });
          continue;
        }
        const deq = adotados.get(eqp.EQPCodigo);
        if (!deq) {
          resultados.push({
            ...base,
            status: 'departamento_nao_adotado',
            mensagem: 'Adote o departamento na configuração deste equipamento; até lá as pessoas ficam no grupo padrão',
          });
          continue;
        }
        if (deq.DEQUltimoErro) {
          resultados.push({ ...base, status: 'erro', mensagem: deq.DEQUltimoErro });
          continue;
        }
        if (!deq._count.regras) {
          resultados.push({ ...base, status: 'sem_regra', mensagem: `"${deq.DEQNome}" não tem nenhuma regra: ninguém passa` });
          continue;
        }
        if (!deq.DEQRevisadoEm) {
          resultados.push({ ...base, status: 'departamento_nao_revisado', mensagem: `"${deq.DEQNome}" ainda não foi conferido` });
          continue;
        }
        resultados.push({ ...base, status: 'aplicado' });
      }
    }

    return resultados.sort(
      (a, b) => (a.EQPDescricao ?? '').localeCompare(b.EQPDescricao ?? '', 'pt-BR') || a.PHANome.localeCompare(b.PHANome),
    );
  }

  // ── espelho da configuração de acesso do equipamento ─────────────────────

  /**
   * Lê a configuração de acesso do equipamento e reconcilia o espelho local. Só leitura no
   * hardware. Sob o lock do equipamento, para não cruzar com uma sincronização em andamento.
   */
  async lerConfiguracaoEquipamento(eqpCodigo: number): Promise<ResumoEspelho> {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    if (!eqp.EQPAtivo) throw new TurmaAcessoErro('Equipamento inativo', 'validacao');
    if (!(await this.op.hardware.suporta(eqp))) {
      throw new TurmaAcessoErro('Marca/modelo sem suporte a configuração de acesso (disponível para Control iD)', 'validacao');
    }

    let r: { ocupado: false; valor: ResumoEspelho } | { ocupado: true };
    try {
      r = await this.op.lock.comLock(this.op.chaveLock(this.ins, eqp.EQPCodigo), LOCK_TTL_MS, () =>
        lerEquipamento(this.prisma, this.ins, this.op.hardware, eqp),
      );
    } catch (err) {
      throw new TurmaAcessoErro(`Não foi possível ler o equipamento: ${mensagemDe(err)}`, 'equipamento');
    }
    if (r.ocupado) throw new TurmaAcessoErro('Outro processo está alterando este equipamento. Tente em instantes.', 'conflito');

    const o = r.valor.observacoes;
    this.log(
      'info',
      `espelho EQP=${eqp.EQPCodigo}: áreas=${r.valor.areas.criadas}+${r.valor.areas.atualizadas}-${r.valor.areas.removidas} ` +
        `portais=${r.valor.portais.criados}+${r.valor.portais.atualizados}-${r.valor.portais.removidos} ` +
        `horários=${r.valor.horarios.criados}+${r.valor.horarios.atualizados}-${r.valor.horarios.removidos} ` +
        `bloqueios=${o.bloqueios} semHorário=${o.regrasSemHorario}${o.leituraVazia ? ' LEITURA VAZIA' : ''}`,
    );
    return r.valor;
  }

  /**
   * Com qual host o sistema fala neste equipamento. `EQPEnderecoIp` é o ÚLTIMO item da precedência
   * (`EQPConfig.host` → `ip_entry` → `ip_exit` → `EQPEnderecoIp`), então "principal" no cadastro
   * não significa "o que o sistema usa".
   */
  async hostsAcessoEquipamento(eqpCodigo: number) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.op.hardware.hostsAcesso(eqp).catch(() => []);
  }

  /** Lê a configuração de cada host e responde se compartilham o mesmo banco de objetos. */
  async compararHostsEquipamento(eqpCodigo: number): Promise<ComparacaoHosts> {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    if (!(await this.op.hardware.suporta(eqp))) {
      throw new TurmaAcessoErro('Marca/modelo sem suporte a configuração de acesso', 'validacao');
    }
    let leituras;
    try {
      leituras = await this.op.hardware.lerConfiguracaoTodosHosts(eqp);
    } catch (err) {
      throw new TurmaAcessoErro(`Não foi possível ler os hosts: ${mensagemDe(err)}`, 'equipamento');
    }
    const comparacao = compararHosts(leituras);
    if (comparacao.veredicto === 'diferentes') {
      this.log('warn', `EQP=${eqp.EQPCodigo}: hosts com bancos de objetos diferentes — ${comparacao.diferencas.join(' | ')}`);
    }
    return comparacao;
  }

  /** Espelho gravado (sem falar com o equipamento). */
  async obterEspelhoEquipamento(eqpCodigo: number) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    const [areas, portais, horarios, departamentos] = await Promise.all([
      this.prisma.aREArea.findMany({
        where: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo },
        orderBy: { ARENome: 'asc' },
      }),
      this.prisma.pTLPortal.findMany({
        where: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo },
        orderBy: { PTLNome: 'asc' },
      }),
      this.prisma.hORHorario.findMany({
        where: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo },
        include: { janelas: { orderBy: { HRJOrdem: 'asc' } }, areas: { select: { ARECodigo: true } } },
        orderBy: { HORNome: 'asc' },
      }),
      this.prisma.dEQDepartamentoEquipamento.findMany({
        where: { INSInstituicaoCodigo: this.ins, EQPCodigo: eqp.EQPCodigo },
        include: {
          departamento: { select: { DEPCodigo: true, DEPNome: true } },
          regras: { include: { areas: { select: { ARECodigo: true } } } },
        },
        orderBy: { DEQNome: 'asc' },
      }),
    ]);

    return {
      EQPCodigo: eqp.EQPCodigo,
      EQPDescricao: eqp.EQPDescricao,
      // Qual host este espelho representa. Sem isso a tela não sabe de onde veio o que mostra.
      hosts: await this.op.hardware.hostsAcesso(eqp).catch(() => []),
      areas: areas.map((a) => ({ ARECodigo: a.ARECodigo, AREIdDevice: a.AREIdDevice, ARENome: a.ARENome })),
      portais: portais.map((p) => ({
        PTLCodigo: p.PTLCodigo,
        PTLIdDevice: p.PTLIdDevice,
        PTLNome: p.PTLNome,
        PTLAreaDeCodigo: p.PTLAreaDeCodigo,
        PTLAreaParaCodigo: p.PTLAreaParaCodigo,
      })),
      horarios: horarios.map((h) => ({
        HORCodigo: h.HORCodigo,
        HORIdDevice: h.HORIdDevice,
        HORNome: h.HORNome,
        areas: h.areas.map((a) => a.ARECodigo),
        janelas: h.janelas.map((j) => ({
          HRJCodigo: j.HRJCodigo,
          inicioSeg: j.HRJInicioSeg,
          fimSeg: j.HRJFimSeg,
          dias: [j.HRJDom, j.HRJSeg, j.HRJTer, j.HRJQua, j.HRJQui, j.HRJSex, j.HRJSab],
          feriados: [j.HRJFeriado1, j.HRJFeriado2, j.HRJFeriado3],
        })),
      })),
      departamentos: departamentos.map((d) => ({
        DEQCodigo: d.DEQCodigo,
        DEQIdDevice: d.DEQIdDevice,
        DEQNome: d.DEQNome,
        DEPCodigo: d.departamento.DEPCodigo,
        DEPNome: d.departamento.DEPNome,
        revisadoEm: d.DEQRevisadoEm,
        verificadoEm: d.DEQVerificadoEm,
        ultimoErro: d.DEQUltimoErro,
        regras: d.regras.map((r) => ({
          DRGCodigo: r.DRGCodigo,
          HORCodigo: r.HORCodigo,
          idRegraDevice: r.DRGIdRegraDevice,
          areas: r.areas.map((a) => a.ARECodigo),
        })),
      })),
    };
  }

  // ── escrita na configuração de acesso (áreas, portais, horários) ─────────

  private contextoAcesso(): ContextoAcesso {
    return {
      prisma: this.prisma,
      ins: this.ins,
      hardware: this.op.hardware,
      lock: this.op.lock,
      chaveLock: this.op.chaveLock,
    };
  }

  /** Devolve o resultado da operação junto do espelho já atualizado, para a tela não reconsultar. */
  private async comEspelho<T>(eqpCodigo: number, resultado: T) {
    return { ...resultado, espelho: await this.obterEspelhoEquipamento(eqpCodigo) };
  }

  async criarAreaEquipamento(eqpCodigo: number, nome: string) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await criarArea(this.contextoAcesso(), eqp, nome));
  }

  async renomearAreaEquipamento(eqpCodigo: number, areCodigo: number, nome: string) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await renomearArea(this.contextoAcesso(), eqp, areCodigo, nome));
  }

  async criarPortalEquipamento(
    eqpCodigo: number,
    dados: { areaDeCodigo: number; areaParaCodigo: number; nome?: string },
  ) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await criarPortal(this.contextoAcesso(), eqp, dados));
  }

  async criarHorarioEquipamento(
    eqpCodigo: number,
    dados: { nome: string; janelas: JanelaDevice[]; ARECodigos?: number[] },
  ) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await criarHorario(this.contextoAcesso(), eqp, dados));
  }

  async atualizarHorarioEquipamento(
    eqpCodigo: number,
    horCodigo: number,
    dados: { nome?: string; janelas?: JanelaDevice[]; ARECodigos?: number[] },
  ) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await atualizarHorario(this.contextoAcesso(), eqp, horCodigo, dados));
  }

  async removerHorarioEquipamento(eqpCodigo: number, horCodigo: number) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await removerHorario(this.contextoAcesso(), eqp, horCodigo));
  }

  // ── departamentos do equipamento ─────────────────────────────────────────

  async criarDepartamentoEquipamento(eqpCodigo: number, dados: { nome: string; DEPCodigo?: number }, origem: Origem) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await criarDepartamento(this.contextoAcesso(), eqp, dados, origem));
  }

  async renomearDepartamentoEquipamento(eqpCodigo: number, deqCodigo: number, nome: string) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await renomearDepartamento(this.contextoAcesso(), eqp, deqCodigo, nome));
  }

  async salvarRegrasDepartamentoEquipamento(eqpCodigo: number, deqCodigo: number, regras: RegraDesejada[]) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await salvarRegrasDepartamento(this.contextoAcesso(), eqp, deqCodigo, regras));
  }

  async revisarDepartamentoEquipamento(eqpCodigo: number, deqCodigo: number, origem: Origem) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await revisarDepartamento(this.contextoAcesso(), eqp, deqCodigo, origem));
  }

  /** Grupos do equipamento ainda sem adoção, com o que cada um já libera. Lê do equipamento. */
  async candidatosDepartamentoEquipamento(eqpCodigo: number) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return candidatosDepartamento(this.contextoAcesso(), eqp);
  }

  async adotarDepartamentoEquipamento(
    eqpCodigo: number,
    dados: { DEQIdDevice: string; DEPCodigo?: number; DEPNome?: string },
  ) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await adotarDepartamento(this.contextoAcesso(), eqp, dados));
  }

  async desadotarDepartamentoEquipamento(eqpCodigo: number, deqCodigo: number) {
    const eqp = await this.equipamentoComSentido(eqpCodigo);
    return this.comEspelho(eqpCodigo, await desadotarDepartamento(this.contextoAcesso(), eqp, deqCodigo));
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
      where: { INSInstituicaoCodigo: this.ins, TRMValidacaoAtiva: true, TRMAtiva: true, DEPCodigo: { not: null } },
      select: {
        TRMCodigo: true,
        TRMPrioridade: true,
        TRMSerie: true,
        TRMTurma: true,
        TRMTurno: true,
        TRMAnoReferencia: true,
        departamento: { select: { DEPNome: true } },
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
      const novoGrupo = eleita ? (porTurma.get(eleita.TRMCodigo)?.departamento?.DEPNome ?? null) : null;

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
        where: { INSInstituicaoCodigo: this.ins, TRMAtiva: false, TRMValidacaoAtiva: true, DEPCodigo: { not: null } },
        include: {
          escopo: { select: { EQPCodigo: true } },
          departamento: { select: { DEPCodigo: true, DEPNome: true } },
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
        DEPCodigo: number;
        DEPNome: string;
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
      if (!o?.departamento) continue;
      pares.push({
        destino: { TRMCodigo: d.TRMCodigo, rotulo: rotuloTurma(d), TRMCurso: d.TRMCurso, TRMQtdePessoas: d.TRMQtdePessoas },
        origem: {
          TRMCodigo: o.TRMCodigo,
          rotulo: rotuloTurma(o),
          DEPCodigo: o.departamento.DEPCodigo,
          DEPNome: o.departamento.DEPNome,
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
      include: { escopo: { select: { EQPCodigo: true } }, departamento: { select: { DEPCodigo: true } } },
    });
    const porCodigo = new Map(turmas.map((t) => [t.TRMCodigo, t]));
    const ativos = new Set((await this.equipamentosDaInstituicao()).filter((e) => e.EQPAtivo).map((e) => e.EQPCodigo));

    const grupos = new Map<string, { entrada: ValidacaoEntrada; destinos: number[] }>();
    const falhas: Array<{ TRMCodigoDestino: number; erro: string }> = [];
    for (const p of lista) {
      const o = porCodigo.get(Number(p.TRMCodigoOrigem));
      const d = porCodigo.get(Number(p.TRMCodigoDestino));
      if (!o?.departamento || !d) {
        falhas.push({ TRMCodigoDestino: Number(p.TRMCodigoDestino), erro: 'Turma de origem sem departamento ou destino inexistente' });
        continue;
      }
      const escopo: EscopoEntrada = o.TRMTodosEquipamentos
        ? { todos: true }
        : { todos: false, EQPCodigos: o.escopo.map((e) => e.EQPCodigo).filter((c) => ativos.has(c)) };
      if (!escopo.todos && !escopo.EQPCodigos?.length) {
        falhas.push({ TRMCodigoDestino: d.TRMCodigo, erro: 'Nenhum dos equipamentos da origem está ativo' });
        continue;
      }
      // Agrupa por (departamento, escopo): uma gravação por grupo.
      const k = JSON.stringify({ dep: o.departamento.DEPCodigo, escopo });
      const g = grupos.get(k) ?? { entrada: { ativa: true, DEPCodigo: o.departamento.DEPCodigo, escopo }, destinos: [] };
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

  private equipamentosDaInstituicao(): Promise<EQPEquipamento[]> {
    return this.prisma.eQPEquipamento.findMany({
      where: { INSInstituicaoCodigo: this.ins },
      orderBy: [{ EQPDescricao: 'asc' }, { EQPCodigo: 'asc' }],
    });
  }

  private async equipamentoComSentido(eqpCodigo: number): Promise<EQPEquipamento> {
    const eqp = await this.prisma.eQPEquipamento.findFirst({
      where: { EQPCodigo: Number(eqpCodigo), INSInstituicaoCodigo: this.ins },
    });
    if (!eqp) throw new TurmaAcessoErro('Equipamento não encontrado', 'nao_encontrado');
    return eqp;
  }
  private async mapaSuporte(equipamentos: EQPEquipamento[]) {
    const pares = await Promise.all(
      equipamentos.map(async (e) => [e.EQPCodigo, await this.op.hardware.suporta(e).catch(() => false)] as const),
    );
    return new Map<number, boolean>(pares);
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
    const nome = (c: number) => porCodigo.get(c)?.EQPDescricao ?? String(c);
    const suporte = await this.mapaSuporte(codigos.map((c) => porCodigo.get(c)!));
    const semSuporte = codigos.filter((c) => !suporte.get(c));
    if (semSuporte.length) {
      throw new TurmaAcessoErro(`Equipamentos sem suporte a controle por turma: ${semSuporte.map(nome).join(', ')}`, 'validacao', {
        EQPCodigos: semSuporte,
      });
    }
    return { todos: false, EQPCodigos: codigos };
  }

  /** Pessoas das turmas vigentes com o equipamento no escopo: reenfileira nele (usado ao preparar as áreas). */
  private async invalidarPessoasDoEquipamento(eqpCodigo: number): Promise<number> {
    const turmas = await this.prisma.tRMTurma.findMany({
      where: {
        INSInstituicaoCodigo: this.ins,
        TRMValidacaoAtiva: true,
        TRMAtiva: true,
        DEPCodigo: { not: null },
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
