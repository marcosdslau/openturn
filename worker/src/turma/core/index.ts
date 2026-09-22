// ARQUIVO GERADO por worker/scripts/sync-shared.cjs a partir de webapi/src/turma/core/index.ts
// NÃO EDITE AQUI — altere na webapi e rode `npm run shared:sync` no worker.
/**
 * Núcleo do controle de acesso por turma — FONTE DA VERDADE.
 *
 * O worker recebe uma cópia desta pasta em worker/src/turma/core (gerada por
 * `npm run shared:sync`, que roda no build). Não edite a cópia.
 * Regra: só importar @prisma/client, módulos do Node e arquivos desta pasta.
 */
export * from './tipos';
export * from './hash-estavel';
export * from './perfil-canonico';
export * from './perfil-nome';
export * from './estado-desejado';
export * from './ports';
export * from './grupo-pessoa';
export * from './espelho';
export * from './hosts-acesso';
export * from './acesso-equipamento.core';
export * from './acesso-departamento.core';
export * from './turma-acesso.core';
export * from './rotina-schema';
