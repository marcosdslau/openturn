-- Remove o modelo antigo de perfis de horário (fase 7 do plano).
-- docs/controle-por-turma/PLANO-IMPLEMENTACAO.md §9.
--
-- DESTRUTIVA E IRREVERSÍVEL: apaga a configuração de horário do modelo antigo. Antes de rodar,
-- a migração de dados (webapi/scripts/migrar-departamentos.ts --aplicar) precisa ter passado e
-- toda turma ativa precisa apontar para um departamento.
--
-- A trava abaixo recusa a migration enquanto houver turma ativa sem `DEPCodigo`. Sem ela, essas
-- turmas ficariam sem vínculo nenhum e os alunos cairiam no grupo padrão da catraca — mudança de
-- acesso real, em silêncio, no meio de um deploy.
--
-- SE ESTA MIGRATION FALHAR NA TRAVA:
--   1. nada foi alterado — o RAISE acontece antes de qualquer DDL e a transação reverte inteira;
--   2. o Prisma marca a migration como falha e bloqueia as próximas. Destrave com:
--        npx prisma migrate resolve --rolled-back 20260921200000_remove_perfil_horario_legado
--   3. resolva a causa (migrar os dados e/ou escolher o departamento das turmas citadas no erro);
--   4. rode `npx prisma migrate deploy` de novo.
DO $$
DECLARE
  pendentes integer;
  exemplos text;
BEGIN
  SELECT count(*), string_agg(DISTINCT "TRMTurma", ', ' ORDER BY "TRMTurma")
    INTO pendentes, exemplos
    FROM "TRMTurma"
   WHERE "TRMValidacaoAtiva" AND "TRMAtiva" AND "DEPCodigo" IS NULL;

  IF pendentes > 0 THEN
    RAISE EXCEPTION
      'Fase 7 bloqueada: % turma(s) ativa(s) ainda dependem do perfil de horário legado (DEPCodigo nulo): %. Rode a migração de dados e escolha o departamento dessas turmas antes de remover o modelo antigo.',
      pendentes, exemplos;
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "TRMTurma" DROP CONSTRAINT "TRMTurma_PHACodigo_fkey";

-- DropForeignKey
ALTER TABLE "PHAPerfilHorario" DROP CONSTRAINT "PHAPerfilHorario_INSInstituicaoCodigo_fkey";

-- DropForeignKey
ALTER TABLE "PHAJanela" DROP CONSTRAINT "PHAJanela_INSInstituicaoCodigo_fkey";

-- DropForeignKey
ALTER TABLE "PHAJanela" DROP CONSTRAINT "PHAJanela_PHACodigo_fkey";

-- DropForeignKey
ALTER TABLE "PHEPerfilEquipamento" DROP CONSTRAINT "PHEPerfilEquipamento_INSInstituicaoCodigo_fkey";

-- DropForeignKey
ALTER TABLE "PHEPerfilEquipamento" DROP CONSTRAINT "PHEPerfilEquipamento_PHACodigo_fkey";

-- DropForeignKey
ALTER TABLE "PHEPerfilEquipamento" DROP CONSTRAINT "PHEPerfilEquipamento_EQPCodigo_fkey";

-- DropForeignKey
ALTER TABLE "EQSEquipamentoSentido" DROP CONSTRAINT "EQSEquipamentoSentido_INSInstituicaoCodigo_fkey";

-- DropForeignKey
ALTER TABLE "EQSEquipamentoSentido" DROP CONSTRAINT "EQSEquipamentoSentido_EQPCodigo_fkey";

-- DropForeignKey
ALTER TABLE "EQSEquipamentoSentido" DROP CONSTRAINT "EQSEquipamentoSentido_USRCodigoValidacao_fkey";

-- DropIndex
DROP INDEX "TRMTurma_PHACodigo_idx";

-- AlterTable
ALTER TABLE "TRMTurma" DROP COLUMN "PHACodigo";

-- DropTable
DROP TABLE "PHAPerfilHorario";

-- DropTable
DROP TABLE "PHAJanela";

-- DropTable
DROP TABLE "PHEPerfilEquipamento";

-- DropTable
DROP TABLE "EQSEquipamentoSentido";

-- DropEnum
DROP TYPE "SentidoArea";

-- DropEnum
DROP TYPE "ModoSentido";

