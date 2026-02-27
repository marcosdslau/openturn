-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('ONLINE', 'OFFLINE', 'PAIRING');

-- CreateEnum
CREATE TYPE "SessaoStatus" AS ENUM ('ATIVA', 'EXPIRADA', 'ENCERRADA');

-- AlterTable
ALTER TABLE "EQPEquipamento" ADD COLUMN     "EQPUsaAddon" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CONConnector" (
    "CONCodigo" SERIAL NOT NULL,
    "CONNome" TEXT NOT NULL,
    "CONToken" TEXT NOT NULL,
    "CONStatus" "ConnectorStatus" NOT NULL DEFAULT 'OFFLINE',
    "CONUltimoHeartbeat" TIMESTAMP(3),
    "CONVersao" TEXT,
    "CONMetadata" JSONB,
    "CLICodigo" INTEGER NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CONConnector_pkey" PRIMARY KEY ("CONCodigo")
);

-- CreateTable
CREATE TABLE "RMTSessaoRemota" (
    "RMTCodigo" SERIAL NOT NULL,
    "RMTSessionId" TEXT NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "CONCodigo" INTEGER NOT NULL,
    "USRCodigo" INTEGER NOT NULL,
    "RMTStatus" "SessaoStatus" NOT NULL DEFAULT 'ATIVA',
    "RMTExpiraEm" TIMESTAMP(3) NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RMTSessaoRemota_pkey" PRIMARY KEY ("RMTCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "CONConnector_CONToken_key" ON "CONConnector"("CONToken");

-- CreateIndex
CREATE UNIQUE INDEX "CONConnector_INSInstituicaoCodigo_key" ON "CONConnector"("INSInstituicaoCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "RMTSessaoRemota_RMTSessionId_key" ON "RMTSessaoRemota"("RMTSessionId");

-- AddForeignKey
ALTER TABLE "CONConnector" ADD CONSTRAINT "CONConnector_CLICodigo_fkey" FOREIGN KEY ("CLICodigo") REFERENCES "CLICliente"("CLICodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CONConnector" ADD CONSTRAINT "CONConnector_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMTSessaoRemota" ADD CONSTRAINT "RMTSessaoRemota_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMTSessaoRemota" ADD CONSTRAINT "RMTSessaoRemota_CONCodigo_fkey" FOREIGN KEY ("CONCodigo") REFERENCES "CONConnector"("CONCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMTSessaoRemota" ADD CONSTRAINT "RMTSessaoRemota_USRCodigo_fkey" FOREIGN KEY ("USRCodigo") REFERENCES "USRUsuario"("USRCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RMTSessaoRemota" ADD CONSTRAINT "RMTSessaoRemota_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;
