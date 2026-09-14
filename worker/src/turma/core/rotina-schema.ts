// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/rotina-schema.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
import type { TurmaAcessoCore } from './turma-acesso.core';
import { TurmaAcessoErro, type Origem } from './tipos';

/** Modelos Prisma expostos em `context.db` (usar em allowedModels das duas engines). */
export const TURMA_MODELOS_ROTINA = [
  'tRMTurma',
  'pHAPerfilHorario',
  'pHAJanela',
  'tEQTurmaEquipamento',
  'pHEPerfilEquipamento',
  'eQSEquipamentoSentido',
];

/**
 * Chaves como aparecem em `context.db`. Escrita direta pularia perfil, invalidação de
 * pessoas e lock — alterações passam por `context.turmas` (§12.6 da spec).
 */
const MODELOS_SOMENTE_LEITURA = new Set([
  'TRMTurma',
  'PHAPerfilHorario',
  'PHAJanela',
  'TEQTurmaEquipamento',
  'PHEPerfilEquipamento',
  'EQSEquipamentoSentido',
]);
const METODOS_LEITURA = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy']);

export function assertEscritaTurmaPermitida(model: string, metodo: string): void {
  if (MODELOS_SOMENTE_LEITURA.has(model) && !METODOS_LEITURA.has(metodo)) {
    throw new Error(`context.db.${model}.${metodo} não é permitido: altere turmas e perfis por context.turmas`);
  }
}

type Campo = { name: string; type: string; pk?: boolean; fk?: string };

/** Definições para o editor de rotinas (dbConfig.tables). */
export const TURMA_SCHEMA_ROTINA: Record<string, { alias: string; fields: Campo[] }> = {
  TRMTurma: {
    alias: 'Turma',
    fields: [
      { name: 'TRMCodigo', type: 'Int', pk: true },
      { name: 'TRMIdExterno', type: 'String' },
      { name: 'TRMIdOferta', type: 'String' },
      { name: 'TRMTurma', type: 'String' },
      { name: 'TRMCurso', type: 'String' },
      { name: 'TRMSerie', type: 'String' },
      { name: 'TRMCurriculo', type: 'String' },
      { name: 'TRMTurno', type: 'String' },
      { name: 'TRMAnoReferencia', type: 'String' },
      { name: 'TRMCalendario', type: 'String' },
      { name: 'TRMDataInicio', type: 'DateTime' },
      { name: 'TRMDataFim', type: 'DateTime' },
      { name: 'PHACodigo', type: 'Int', fk: 'PHAPerfilHorario' },
      { name: 'TRMValidacaoAtiva', type: 'Boolean' },
      { name: 'TRMTodosEquipamentos', type: 'Boolean' },
      { name: 'TRMAtiva', type: 'Boolean' },
      { name: 'TRMPrioridade', type: 'Int' },
      { name: 'TRMQtdePessoas', type: 'Int' },
      { name: 'TRMAlteradoEm', type: 'DateTime' },
      { name: 'updatedAt', type: 'DateTime' },
    ],
  },
  PHAPerfilHorario: {
    alias: 'PerfilHorario',
    fields: [
      { name: 'PHACodigo', type: 'Int', pk: true },
      { name: 'PHANome', type: 'String' },
      { name: 'PHAHashJanelas', type: 'String' },
      { name: 'PHAHashConfig', type: 'String' },
      { name: 'PHAModoInterna', type: 'Enum' },
      { name: 'PHAModoExterna', type: 'Enum' },
      { name: 'updatedAt', type: 'DateTime' },
    ],
  },
  PHAJanela: {
    alias: 'PerfilHorarioJanela',
    fields: [
      { name: 'PHJCodigo', type: 'Int', pk: true },
      { name: 'PHACodigo', type: 'Int', fk: 'PHAPerfilHorario' },
      { name: 'PHJSentido', type: 'Enum' },
      { name: 'PHJHoraInicio', type: 'String' },
      { name: 'PHJHoraFim', type: 'String' },
      { name: 'PHJDom', type: 'Boolean' },
      { name: 'PHJSeg', type: 'Boolean' },
      { name: 'PHJTer', type: 'Boolean' },
      { name: 'PHJQua', type: 'Boolean' },
      { name: 'PHJQui', type: 'Boolean' },
      { name: 'PHJSex', type: 'Boolean' },
      { name: 'PHJSab', type: 'Boolean' },
      { name: 'PHJOrdem', type: 'Int' },
    ],
  },
  TEQTurmaEquipamento: {
    alias: 'TurmaEquipamento',
    fields: [
      { name: 'TEQCodigo', type: 'Int', pk: true },
      { name: 'TRMCodigo', type: 'Int', fk: 'TRMTurma' },
      { name: 'EQPCodigo', type: 'Int', fk: 'EQPEquipamento' },
    ],
  },
  PHEPerfilEquipamento: {
    alias: 'PerfilEquipamento',
    fields: [
      { name: 'PHECodigo', type: 'Int', pk: true },
      { name: 'PHACodigo', type: 'Int', fk: 'PHAPerfilHorario' },
      { name: 'EQPCodigo', type: 'Int', fk: 'EQPEquipamento' },
      { name: 'PHEIdGrupo', type: 'String' },
      { name: 'PHEIdRegraInterna', type: 'String' },
      { name: 'PHEIdHorarioInterna', type: 'String' },
      { name: 'PHEIdRegraExterna', type: 'String' },
      { name: 'PHEIdHorarioExterna', type: 'String' },
      { name: 'PHESyncHash', type: 'String' },
      { name: 'PHESyncedAt', type: 'DateTime' },
      { name: 'PHEUltimoErro', type: 'String' },
    ],
  },
  EQSEquipamentoSentido: {
    alias: 'EquipamentoSentido',
    fields: [
      { name: 'EQSCodigo', type: 'Int', pk: true },
      { name: 'EQPCodigo', type: 'Int', fk: 'EQPEquipamento' },
      { name: 'EQSAreaInternaId', type: 'String' },
      { name: 'EQSAreaExternaId', type: 'String' },
      { name: 'EQSPortalInternaId', type: 'String' },
      { name: 'EQSPortalExternaId', type: 'String' },
      { name: 'EQSInvertido', type: 'Boolean' },
      { name: 'EQSCatraConfig', type: 'Json' },
      { name: 'EQSPreparadoEm', type: 'DateTime' },
      { name: 'EQSValidadoEm', type: 'DateTime' },
      { name: 'EQSUltimoErro', type: 'String' },
    ],
  },
};

/** Campos novos em tabelas que as engines já expõem. */
export const TURMA_CAMPOS_EXISTENTES: Record<string, Campo[]> = {
  PESPessoa: [
    { name: 'PESTRMCodigo', type: 'Int', fk: 'TRMTurma' },
    { name: 'PESGrupoHorario', type: 'String' },
  ],
  MATMatricula: [{ name: 'TRMCodigo', type: 'Int', fk: 'TRMTurma' }],
};

/** Mescla as definições de turma no schemaDefinition de uma engine. */
export function mesclarSchemaTurmas<T extends Record<string, { alias: string; fields: Campo[] }>>(schema: T): T {
  const saida: Record<string, { alias: string; fields: Campo[] }> = { ...schema, ...TURMA_SCHEMA_ROTINA };
  for (const [tabela, campos] of Object.entries(TURMA_CAMPOS_EXISTENTES)) {
    const atual = saida[tabela];
    if (!atual) continue;
    const nomes = new Set(atual.fields.map((f) => f.name));
    saida[tabela] = { ...atual, fields: [...atual.fields, ...campos.filter((c) => !nomes.has(c.name))] };
  }
  return saida as T;
}

/**
 * Lista fechada de métodos de `context.turmas`. Métodos que alteram configuração recebem a
 * origem da execução (rotina) — o código da rotina não consegue se passar por usuário.
 */
const DESPACHO: Record<string, (core: TurmaAcessoCore, args: any[], origem: Origem) => Promise<unknown>> = {
  listar: (c, a) => c.listar(a[0] ?? {}),
  opcoesFiltro: (c) => c.opcoesFiltro(),
  obter: (c, a) => c.obter(a[0]),
  // Sem foto via RPC: base64 de dezenas de fotos não cabe numa chamada de rotina.
  listarPessoas: (c, a) => c.listarPessoas(a[0], { ...(a[1] ?? {}), comFoto: false }),
  listarPerfis: (c) => c.listarPerfis(),
  previewPerfil: (c, a) => c.previewPerfil(a[0], a[1]),
  salvarValidacao: (c, a, o) => c.salvarValidacao(a[0], a[1], o),
  salvarValidacaoEmLote: (c, a, o) => c.salvarValidacaoEmLote(a[0], a[1], o),
  renomearPerfil: (c, a, o) => c.renomearPerfil(a[0], a[1], o),
  grupoNoEquipamento: (c, a) => c.grupoNoEquipamento(a[0], a[1]),
  gruposNoEquipamentos: (c, a) => c.gruposNoEquipamentos(a[0], a[1]),
  sincronizar: (c, a) => c.sincronizar(a[0] ?? {}),
  reconciliar: (c, a) => c.reconciliar(a[0] ?? {}),
  vincularPessoas: (c) => c.vincularPessoas(),
  importarCatalogo: (c, a) => c.importarCatalogo(a[0]),
  sugestoesImportacaoAnoAnterior: (c) => c.sugestoesImportacaoAnoAnterior(),
  importarAnoAnterior: (c, a, o) => c.importarAnoAnterior(a[0], o),
  lerRegraAplicada: (c, a) => c.lerRegraAplicada(a[0], a[1]),
  listarEquipamentosSentido: (c) => c.listarEquipamentosSentido(),
  lerSentidoEquipamento: (c, a) => c.lerSentidoEquipamento(a[0]),
  prepararSentidoEquipamento: (c, a, o) => c.prepararSentidoEquipamento(a[0], o),
  atualizarSentidoEquipamento: (c, a, o) => c.atualizarSentidoEquipamento(a[0], a[1] ?? {}, o),
};

export const TURMAS_METODOS_RPC = Object.keys(DESPACHO);

export async function executarTurmasRpc(core: TurmaAcessoCore, metodo: string, args: unknown[], origem: Origem) {
  const fn = DESPACHO[metodo];
  if (!fn) throw new Error(`context.turmas.${metodo} não existe. Disponíveis: ${TURMAS_METODOS_RPC.join(', ')}`);
  try {
    return await fn(core, Array.isArray(args) ? args : [], origem);
  } catch (err) {
    if (err instanceof TurmaAcessoErro) {
      const detalhes = err.detalhes ? ` ${JSON.stringify(err.detalhes)}` : '';
      throw new Error(`${err.message}${detalhes}`);
    }
    throw err;
  }
}
