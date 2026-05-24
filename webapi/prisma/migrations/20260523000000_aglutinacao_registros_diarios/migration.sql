-- CreateEnum
CREATE TYPE "TipoAglutinacaoRegistro" AS ENUM ('tempo_permanencia', 'tempo_permanencia_periodo', 'entrada_saida');

-- DropIndex
DROP INDEX "RPDRegistrosDiarios_INSInstituicaoCodigo_PESCodigo_RPDData_key";

-- AlterTable
ALTER TABLE "INSInstituicao" ADD COLUMN     "INSAglutinacaoRegistros" "TipoAglutinacaoRegistro" NOT NULL DEFAULT 'entrada_saida',
ADD COLUMN     "INSSyncFreqEducacional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "INSTempoFreqEducacional" TEXT NOT NULL DEFAULT '58 23 * * *';

-- AlterTable
ALTER TABLE "RPDRegistrosDiarios" ADD COLUMN     "PERCodigo" INTEGER,
ADD COLUMN     "RPDAlteradoEm" TIMESTAMP(3),
ADD COLUMN     "RPDJanelaIndice" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "USRCodigoAlteracao" INTEGER,
ADD COLUMN     "USRCodigoCriacao" INTEGER;

-- Backfill: garantir que todos os RPDs existentes tenham RPDJanelaIndice = 1
UPDATE "RPDRegistrosDiarios" SET "RPDJanelaIndice" = 1 WHERE "RPDJanelaIndice" IS NULL;

-- CreateTable
CREATE TABLE "PERPeriodosConfig" (
    "PERCodigo" SERIAL NOT NULL,
    "PERNome" TEXT NOT NULL,
    "PERHorarioInicio" TEXT NOT NULL,
    "PERHorarioFim" TEXT NOT NULL,
    "PERToleranciaEntradaMinutos" INTEGER NOT NULL DEFAULT 0,
    "PERToleranciaSaidaMinutos" INTEGER NOT NULL DEFAULT 0,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PERPeriodosConfig_pkey" PRIMARY KEY ("PERCodigo")
);

-- CreateIndex
CREATE INDEX "PERPeriodosConfig_INSInstituicaoCodigo_idx" ON "PERPeriodosConfig"("INSInstituicaoCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "PERPeriodosConfig_INSInstituicaoCodigo_PERNome_key" ON "PERPeriodosConfig"("INSInstituicaoCodigo", "PERNome");

-- CreateIndex
CREATE UNIQUE INDEX "RPDRegistrosDiarios_INSInstituicaoCodigo_PESCodigo_RPDData__key" ON "RPDRegistrosDiarios"("INSInstituicaoCodigo", "PESCodigo", "RPDData", "RPDJanelaIndice");

-- AddForeignKey
ALTER TABLE "PERPeriodosConfig" ADD CONSTRAINT "PERPeriodosConfig_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RPDRegistrosDiarios" ADD CONSTRAINT "RPDRegistrosDiarios_PERCodigo_fkey" FOREIGN KEY ("PERCodigo") REFERENCES "PERPeriodosConfig"("PERCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RPDRegistrosDiarios" ADD CONSTRAINT "RPDRegistrosDiarios_USRCodigoCriacao_fkey" FOREIGN KEY ("USRCodigoCriacao") REFERENCES "USRUsuario"("USRCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RPDRegistrosDiarios" ADD CONSTRAINT "RPDRegistrosDiarios_USRCodigoAlteracao_fkey" FOREIGN KEY ("USRCodigoAlteracao") REFERENCES "USRUsuario"("USRCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS para nova tabela PERPeriodosConfig (padrão tenant)
ALTER TABLE "PERPeriodosConfig" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_per ON "PERPeriodosConfig"
  USING ("INSInstituicaoCodigo" = current_tenant());
