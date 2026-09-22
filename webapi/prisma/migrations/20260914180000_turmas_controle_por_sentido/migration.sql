-- Controle de acesso por turma com regras separadas por sentido (Área Interna / Área Externa).
-- Spec: working/Controle-turma/SpecControlId.md. Aditiva, exceto o rename de duas colunas de PHEPerfilEquipamento.

-- CreateEnum
CREATE TYPE "SentidoArea" AS ENUM ('INTERNA', 'EXTERNA');

-- CreateEnum
CREATE TYPE "ModoSentido" AS ENUM ('LIVRE', 'HORARIO', 'BLOQUEADO');

-- Perfis: modo por sentido. Perfis existentes restringiam os dois sentidos com as mesmas faixas → HORARIO/HORARIO.
ALTER TABLE "PHAPerfilHorario" ADD COLUMN     "PHAModoInterna" "ModoSentido" NOT NULL DEFAULT 'HORARIO',
ADD COLUMN     "PHAModoExterna" "ModoSentido" NOT NULL DEFAULT 'HORARIO';

-- Faixas: sentido. As existentes valem para os dois sentidos → duplica como EXTERNA.
DROP INDEX "PHAJanela_PHACodigo_idx";
ALTER TABLE "PHAJanela" ADD COLUMN     "PHJSentido" "SentidoArea" NOT NULL DEFAULT 'INTERNA';
INSERT INTO "PHAJanela" ("INSInstituicaoCodigo", "PHACodigo", "PHJSentido", "PHJHoraInicio", "PHJHoraFim",
                         "PHJDom", "PHJSeg", "PHJTer", "PHJQua", "PHJQui", "PHJSex", "PHJSab",
                         "PHJFeriado1", "PHJFeriado2", "PHJFeriado3", "PHJOrdem")
SELECT "INSInstituicaoCodigo", "PHACodigo", 'EXTERNA', "PHJHoraInicio", "PHJHoraFim",
       "PHJDom", "PHJSeg", "PHJTer", "PHJQua", "PHJQui", "PHJSex", "PHJSab",
       "PHJFeriado1", "PHJFeriado2", "PHJFeriado3", "PHJOrdem"
FROM "PHAJanela";
CREATE INDEX "PHAJanela_PHACodigo_PHJSentido_idx" ON "PHAJanela"("PHACodigo", "PHJSentido");

-- O hash do perfil passou a considerar as duas regras (versão 2). Valores provisórios únicos;
-- a reconciliação (context.turmas.reconciliar) recalcula. Enquanto isso, turmas novas com o mesmo
-- horário criam um perfil novo — o legado fica sem uso e sai dos equipamentos normalmente.
UPDATE "PHAPerfilHorario"
SET "PHAHashJanelas" = 'legado-' || "PHACodigo",
    "PHAHashConfig"  = 'legado-' || "PHACodigo";

-- Estado de sync: ids por sentido. Rename preserva os ids já gravados (a regra antiga vira a "interna");
-- o hash é zerado para forçar a regravação no formato por sentido.
ALTER TABLE "PHEPerfilEquipamento" RENAME COLUMN "PHEIdRegraAcesso" TO "PHEIdRegraInterna";
ALTER TABLE "PHEPerfilEquipamento" RENAME COLUMN "PHEIdHorario" TO "PHEIdHorarioInterna";
ALTER TABLE "PHEPerfilEquipamento" ADD COLUMN "PHEIdRegraExterna" TEXT,
ADD COLUMN "PHEIdHorarioExterna" TEXT;
UPDATE "PHEPerfilEquipamento" SET "PHESyncHash" = NULL;

-- CreateTable
CREATE TABLE "EQSEquipamentoSentido" (
    "EQSCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "EQSAreaInternaId" TEXT,
    "EQSAreaExternaId" TEXT,
    "EQSPortalInternaId" TEXT,
    "EQSPortalExternaId" TEXT,
    "EQSInvertido" BOOLEAN NOT NULL DEFAULT false,
    "EQSCatraConfig" JSONB,
    "EQSDiagnostico" JSONB,
    "EQSPreparadoEm" TIMESTAMP(3),
    "EQSValidadoEm" TIMESTAMP(3),
    "USRCodigoValidacao" INTEGER,
    "EQSUltimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EQSEquipamentoSentido_pkey" PRIMARY KEY ("EQSCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "EQSEquipamentoSentido_EQPCodigo_key" ON "EQSEquipamentoSentido"("EQPCodigo");

-- AddForeignKey
ALTER TABLE "EQSEquipamentoSentido" ADD CONSTRAINT "EQSEquipamentoSentido_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EQSEquipamentoSentido" ADD CONSTRAINT "EQSEquipamentoSentido_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EQSEquipamentoSentido" ADD CONSTRAINT "EQSEquipamentoSentido_USRCodigoValidacao_fkey" FOREIGN KEY ("USRCodigoValidacao") REFERENCES "USRUsuario"("USRCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

SELECT setval(pg_get_serial_sequence('"EQSEquipamentoSentido"', 'EQSCodigo'), 100, false);
