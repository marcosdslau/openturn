-- A turma passa a apontar para o departamento (fase 5 do plano).
-- docs/controle-por-turma/PLANO-IMPLEMENTACAO.md §9. Aditiva: `PHACodigo` continua existindo e só
-- sai na fase 7, para permitir rollback e para a migração de dados (fase 6) ler os dois lados.

-- AlterTable
ALTER TABLE "TRMTurma" ADD COLUMN     "DEPCodigo" INTEGER;

-- CreateIndex
CREATE INDEX "TRMTurma_DEPCodigo_idx" ON "TRMTurma"("DEPCodigo");

-- AddForeignKey
ALTER TABLE "TRMTurma" ADD CONSTRAINT "TRMTurma_DEPCodigo_fkey" FOREIGN KEY ("DEPCodigo") REFERENCES "DEPDepartamento"("DEPCodigo") ON DELETE SET NULL ON UPDATE CASCADE;
