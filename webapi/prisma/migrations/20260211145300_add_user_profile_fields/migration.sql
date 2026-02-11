/*
  Warnings:

  - You are about to drop the column `CLICodigo` on the `USRUsuario` table. All the data in the column will be lost.
  - You are about to drop the column `INSCodigo` on the `USRUsuario` table. All the data in the column will be lost.
  - You are about to drop the column `USRGrupo` on the `USRUsuario` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `USRUsuario` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AcaoPassagem" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusComando" AS ENUM ('PENDENTE', 'ENVIADO', 'EXECUTADO', 'ERRO');

-- DropForeignKey
ALTER TABLE "USRUsuario" DROP CONSTRAINT "USRUsuario_CLICodigo_fkey";

-- DropForeignKey
ALTER TABLE "USRUsuario" DROP CONSTRAINT "USRUsuario_INSCodigo_fkey";

-- AlterTable
ALTER TABLE "EQPEquipamento" ADD COLUMN     "EQPAtivo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MATMatricula" ADD COLUMN     "MATAtivo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "USRUsuario" DROP COLUMN "CLICodigo",
DROP COLUMN "INSCodigo",
DROP COLUMN "USRGrupo",
ADD COLUMN     "USRBio" TEXT,
ADD COLUMN     "USRCep" TEXT,
ADD COLUMN     "USRCidade" TEXT,
ADD COLUMN     "USREstado" TEXT,
ADD COLUMN     "USRFacebook" TEXT,
ADD COLUMN     "USRFotoUrl" TEXT,
ADD COLUMN     "USRInstagram" TEXT,
ADD COLUMN     "USRLinkedin" TEXT,
ADD COLUMN     "USRPais" TEXT,
ADD COLUMN     "USRTaxId" TEXT,
ADD COLUMN     "USRTelefone" TEXT,
ADD COLUMN     "USRTwitter" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "USRAcesso" (
    "UACCodigo" SERIAL NOT NULL,
    "USRCodigo" INTEGER NOT NULL,
    "grupo" "GrupoAcesso" NOT NULL,
    "CLICodigo" INTEGER,
    "INSInstituicaoCodigo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "USRAcesso_pkey" PRIMARY KEY ("UACCodigo")
);

-- CreateTable
CREATE TABLE "REGRegistroPassagem" (
    "REGCodigo" SERIAL NOT NULL,
    "PESCodigo" INTEGER NOT NULL,
    "REGAcao" "AcaoPassagem" NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "REGTimestamp" BIGINT NOT NULL,
    "REGDataHora" TIMESTAMP(3) NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "REGRegistroPassagem_pkey" PRIMARY KEY ("REGCodigo")
);

-- CreateTable
CREATE TABLE "CMDComandoFila" (
    "CMDCodigo" SERIAL NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "CMDVerb" TEXT NOT NULL DEFAULT 'POST',
    "CMDEndpoint" TEXT NOT NULL,
    "CMDBody" JSONB,
    "CMDContentType" TEXT NOT NULL DEFAULT 'application/json',
    "CMDStatus" "StatusComando" NOT NULL DEFAULT 'PENDENTE',
    "CMDResultado" JSONB,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMDComandoFila_pkey" PRIMARY KEY ("CMDCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "USRAcesso_USRCodigo_grupo_CLICodigo_INSInstituicaoCodigo_key" ON "USRAcesso"("USRCodigo", "grupo", "CLICodigo", "INSInstituicaoCodigo");

-- AddForeignKey
ALTER TABLE "USRAcesso" ADD CONSTRAINT "USRAcesso_USRCodigo_fkey" FOREIGN KEY ("USRCodigo") REFERENCES "USRUsuario"("USRCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "USRAcesso" ADD CONSTRAINT "USRAcesso_CLICodigo_fkey" FOREIGN KEY ("CLICodigo") REFERENCES "CLICliente"("CLICodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "USRAcesso" ADD CONSTRAINT "USRAcesso_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "REGRegistroPassagem" ADD CONSTRAINT "REGRegistroPassagem_PESCodigo_fkey" FOREIGN KEY ("PESCodigo") REFERENCES "PESPessoa"("PESCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "REGRegistroPassagem" ADD CONSTRAINT "REGRegistroPassagem_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "REGRegistroPassagem" ADD CONSTRAINT "REGRegistroPassagem_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMDComandoFila" ADD CONSTRAINT "CMDComandoFila_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMDComandoFila" ADD CONSTRAINT "CMDComandoFila_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;
