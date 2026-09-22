import type { TurmaAcessoCore } from './turma-acesso.core';
import { TurmaAcessoErro, type Origem } from './tipos';

/** Modelos Prisma expostos em `context.db` (usar em allowedModels das duas engines). */
export const TURMA_MODELOS_ROTINA = [
  'tRMTurma',
  'tEQTurmaEquipamento',
  'dEPDepartamento',
  'dEQDepartamentoEquipamento',
];

/**
 * Chaves como aparecem em `context.db`. Escrita direta pularia perfil, invalidação de
 * pessoas e lock — alterações passam por `context.turmas` (§12.6 da spec).
 */
const MODELOS_SOMENTE_LEITURA = new Set([
  'TRMTurma',
  'TEQTurmaEquipamento',
  'DEPDepartamento',
  'DEQDepartamentoEquipamento',
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
      { name: 'DEPCodigo', type: 'Int', fk: 'DEPDepartamento' },
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
      { name: 'TRMValidacaoAtiva', type: 'Boolean' },
      { name: 'TRMTodosEquipamentos', type: 'Boolean' },
      { name: 'TRMAtiva', type: 'Boolean' },
      { name: 'TRMPrioridade', type: 'Int' },
      { name: 'TRMQtdePessoas', type: 'Int' },
      { name: 'TRMAlteradoEm', type: 'DateTime' },
      { name: 'updatedAt', type: 'DateTime' },
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
  DEPDepartamento: {
    alias: 'Departamento',
    fields: [
      { name: 'DEPCodigo', type: 'Int', pk: true },
      { name: 'DEPNome', type: 'String' },
      { name: 'DEPDescricao', type: 'String' },
      { name: 'updatedAt', type: 'DateTime' },
    ],
  },
  DEQDepartamentoEquipamento: {
    alias: 'DepartamentoEquipamento',
    fields: [
      { name: 'DEQCodigo', type: 'Int', pk: true },
      { name: 'DEPCodigo', type: 'Int', fk: 'DEPDepartamento' },
      { name: 'EQPCodigo', type: 'Int', fk: 'EQPEquipamento' },
      // id de `groups` no equipamento: é ele que vai no setGroups da rotina de gravação.
      { name: 'DEQIdDevice', type: 'String' },
      { name: 'DEQNome', type: 'String' },
      { name: 'DEQRevisadoEm', type: 'DateTime' },
      { name: 'DEQVerificadoEm', type: 'DateTime' },
      { name: 'DEQUltimoErro', type: 'String' },
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
  salvarValidacao: (c, a, o) => c.salvarValidacao(a[0], a[1], o),
  salvarValidacaoEmLote: (c, a, o) => c.salvarValidacaoEmLote(a[0], a[1], o),
  grupoNoEquipamento: (c, a) => c.grupoNoEquipamento(a[0], a[1]),
  gruposNoEquipamentos: (c, a) => c.gruposNoEquipamentos(a[0], a[1]),
  vincularPessoas: (c) => c.vincularPessoas(),
  importarCatalogo: (c, a) => c.importarCatalogo(a[0]),
  sugestoesImportacaoAnoAnterior: (c) => c.sugestoesImportacaoAnoAnterior(),
  importarAnoAnterior: (c, a, o) => c.importarAnoAnterior(a[0], o),
  listarDepartamentos: (c) => c.listarDepartamentos(),
  verificarDepartamentos: (c, a) => c.verificarDepartamentos(a[0] ?? {}),
  compararHostsEquipamento: (c, a) => c.compararHostsEquipamento(a[0]),
  candidatosDepartamentoEquipamento: (c, a) => c.candidatosDepartamentoEquipamento(a[0]),
  obterEspelhoEquipamento: (c, a) => c.obterEspelhoEquipamento(a[0]),
  lerConfiguracaoEquipamento: (c, a) => c.lerConfiguracaoEquipamento(a[0]),
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
