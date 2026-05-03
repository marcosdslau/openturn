-- CreateEnum
CREATE TYPE "RPDStatus" AS ENUM ('ENVIADO', 'ERRO', 'MANUAL', 'PENDENTE');

-- AlterTable
ALTER TABLE "INSInstituicao" ADD COLUMN     "INSSyncRegistrosDiarios" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "INSTempoSync" TEXT NOT NULL DEFAULT '0 0 9,15,22 * * *';

-- AlterTable
ALTER TABLE "REGRegistroPassagem" ADD COLUMN     "REGProcessado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RPDRegistrosDiarios" (
    "RPDCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "RPDData" DATE NOT NULL,
    "PESCodigo" INTEGER NOT NULL,
    "RPDDataEntrada" TIMESTAMP(3),
    "RPDDataSaida" TIMESTAMP(3),
    "RPDStatus" "RPDStatus" NOT NULL DEFAULT 'PENDENTE',
    "RPDResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RPDRegistrosDiarios_pkey" PRIMARY KEY ("RPDCodigo")
);

-- CreateIndex
CREATE INDEX "RPDRegistrosDiarios_INSInstituicaoCodigo_RPDData_idx" ON "RPDRegistrosDiarios"("INSInstituicaoCodigo", "RPDData");

-- CreateIndex
CREATE UNIQUE INDEX "RPDRegistrosDiarios_INSInstituicaoCodigo_PESCodigo_RPDData_key" ON "RPDRegistrosDiarios"("INSInstituicaoCodigo", "PESCodigo", "RPDData");

-- CreateIndex
CREATE INDEX "REGRegistroPassagem_INSInstituicaoCodigo_REGProcessado_idx" ON "REGRegistroPassagem"("INSInstituicaoCodigo", "REGProcessado");

-- AddForeignKey
ALTER TABLE "RPDRegistrosDiarios" ADD CONSTRAINT "RPDRegistrosDiarios_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RPDRegistrosDiarios" ADD CONSTRAINT "RPDRegistrosDiarios_PESCodigo_fkey" FOREIGN KEY ("PESCodigo") REFERENCES "PESPessoa"("PESCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;
