-- CreateTable
CREATE TABLE "AIPProvedorIa" (
    "AIPCodigo" SERIAL NOT NULL,
    "AIPNome" TEXT NOT NULL,
    "AIPAtivo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AIPProvedorIa_pkey" PRIMARY KEY ("AIPCodigo")
);

-- CreateTable
CREATE TABLE "AIMModeloIa" (
    "AIMCodigo" SERIAL NOT NULL,
    "AIPCodigo" INTEGER NOT NULL,
    "AIMNome" TEXT NOT NULL,
    "AIMProviderModelId" TEXT NOT NULL,
    "AIMCustoInput1k" DOUBLE PRECISION NOT NULL,
    "AIMCustoOutput1k" DOUBLE PRECISION NOT NULL,
    "AIMMaxTokens" INTEGER NOT NULL,
    "AIMAtivo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AIMModeloIa_pkey" PRIMARY KEY ("AIMCodigo")
);

-- CreateTable
CREATE TABLE "AIPEPermissaoIa" (
    "AIPECodigo" SERIAL NOT NULL,
    "USRCodigo" INTEGER NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "AIPEHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "AIPEModelosPermitidos" TEXT,
    "AIPELimiteTokensDia" INTEGER NOT NULL DEFAULT 100000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIPEPermissaoIa_pkey" PRIMARY KEY ("AIPECodigo")
);

-- CreateTable
CREATE TABLE "AICConversaIa" (
    "AICCodigo" SERIAL NOT NULL,
    "AICTitulo" TEXT NOT NULL,
    "USRCodigo" INTEGER NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "ROTCodigo" INTEGER,
    "AIMCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AICConversaIa_pkey" PRIMARY KEY ("AICCodigo")
);

-- CreateTable
CREATE TABLE "AIMSMensagemIa" (
    "AIMSCodigo" SERIAL NOT NULL,
    "AICCodigo" INTEGER NOT NULL,
    "AIMSRole" TEXT NOT NULL,
    "AIMSContent" TEXT NOT NULL,
    "AIMSIsContextFile" BOOLEAN NOT NULL DEFAULT false,
    "AIMSInputTokens" INTEGER NOT NULL DEFAULT 0,
    "AIMSOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "AIMSCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMSMensagemIa_pkey" PRIMARY KEY ("AIMSCodigo")
);

-- CreateTable
CREATE TABLE "AILCreditoLedger" (
    "AILCodigo" SERIAL NOT NULL,
    "USRCodigo" INTEGER NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "AILTipoLog" TEXT NOT NULL,
    "AILTokensInput" INTEGER NOT NULL DEFAULT 0,
    "AILTokensOutput" INTEGER NOT NULL DEFAULT 0,
    "AIMCodigo" INTEGER,
    "AILValorUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AILCreditoLedger_pkey" PRIMARY KEY ("AILCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIPEPermissaoIa_USRCodigo_INSInstituicaoCodigo_key" ON "AIPEPermissaoIa"("USRCodigo", "INSInstituicaoCodigo");

-- AddForeignKey
ALTER TABLE "AIMModeloIa" ADD CONSTRAINT "AIMModeloIa_AIPCodigo_fkey" FOREIGN KEY ("AIPCodigo") REFERENCES "AIPProvedorIa"("AIPCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPEPermissaoIa" ADD CONSTRAINT "AIPEPermissaoIa_USRCodigo_fkey" FOREIGN KEY ("USRCodigo") REFERENCES "USRUsuario"("USRCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPEPermissaoIa" ADD CONSTRAINT "AIPEPermissaoIa_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICConversaIa" ADD CONSTRAINT "AICConversaIa_USRCodigo_fkey" FOREIGN KEY ("USRCodigo") REFERENCES "USRUsuario"("USRCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICConversaIa" ADD CONSTRAINT "AICConversaIa_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICConversaIa" ADD CONSTRAINT "AICConversaIa_ROTCodigo_fkey" FOREIGN KEY ("ROTCodigo") REFERENCES "ROTRotina"("ROTCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICConversaIa" ADD CONSTRAINT "AICConversaIa_AIMCodigo_fkey" FOREIGN KEY ("AIMCodigo") REFERENCES "AIMModeloIa"("AIMCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMSMensagemIa" ADD CONSTRAINT "AIMSMensagemIa_AICCodigo_fkey" FOREIGN KEY ("AICCodigo") REFERENCES "AICConversaIa"("AICCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMSMensagemIa" ADD CONSTRAINT "AIMSMensagemIa_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AILCreditoLedger" ADD CONSTRAINT "AILCreditoLedger_USRCodigo_fkey" FOREIGN KEY ("USRCodigo") REFERENCES "USRUsuario"("USRCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AILCreditoLedger" ADD CONSTRAINT "AILCreditoLedger_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AILCreditoLedger" ADD CONSTRAINT "AILCreditoLedger_AIMCodigo_fkey" FOREIGN KEY ("AIMCodigo") REFERENCES "AIMModeloIa"("AIMCodigo") ON DELETE SET NULL ON UPDATE CASCADE;
