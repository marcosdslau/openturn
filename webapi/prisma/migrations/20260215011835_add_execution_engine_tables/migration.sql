-- CreateEnum
CREATE TYPE "TipoRotina" AS ENUM ('SCHEDULE', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "HttpMetodo" AS ENUM ('GET', 'POST', 'PUT', 'PATCH');

-- CreateEnum
CREATE TYPE "StatusExecucao" AS ENUM ('SUCESSO', 'ERRO', 'TIMEOUT');

-- CreateTable
CREATE TABLE "ROTRotina" (
    "ROTCodigo" SERIAL NOT NULL,
    "ROTNome" TEXT NOT NULL,
    "ROTDescricao" TEXT,
    "ROTTipo" "TipoRotina" NOT NULL,
    "ROTCronExpressao" TEXT,
    "ROTWebhookPath" TEXT,
    "ROTWebhookMetodo" "HttpMetodo",
    "ROTWebhookSeguro" BOOLEAN NOT NULL DEFAULT true,
    "ROTWebhookToken" TEXT,
    "ROTCodigoJS" TEXT NOT NULL,
    "ROTAtivo" BOOLEAN NOT NULL DEFAULT true,
    "ROTTimeoutSeconds" INTEGER NOT NULL DEFAULT 30,
    "ROTUltimaExecucao" TIMESTAMP(3),
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER NOT NULL,

    CONSTRAINT "ROTRotina_pkey" PRIMARY KEY ("ROTCodigo")
);

-- CreateTable
CREATE TABLE "ROTExecucaoLog" (
    "EXECodigo" SERIAL NOT NULL,
    "ROTCodigo" INTEGER NOT NULL,
    "EXEStatus" "StatusExecucao" NOT NULL,
    "EXEInicio" TIMESTAMP(3) NOT NULL,
    "EXEFim" TIMESTAMP(3),
    "EXEDuracaoMs" INTEGER,
    "EXEResultado" JSONB,
    "EXEErro" TEXT,
    "EXETrigger" TEXT NOT NULL,
    "EXERequestBody" JSONB,
    "EXERequestParams" JSONB,
    "EXERequestPath" TEXT,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ROTExecucaoLog_pkey" PRIMARY KEY ("EXECodigo")
);

-- CreateTable
CREATE TABLE "ROTHistoricoVersao" (
    "HVICodigo" SERIAL NOT NULL,
    "ROTCodigo" INTEGER NOT NULL,
    "HVICodigoJS" TEXT NOT NULL,
    "HVIObservacao" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ROTHistoricoVersao_pkey" PRIMARY KEY ("HVICodigo")
);

-- AddForeignKey
ALTER TABLE "ROTRotina" ADD CONSTRAINT "ROTRotina_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ROTRotina" ADD CONSTRAINT "ROTRotina_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "USRUsuario"("USRCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ROTExecucaoLog" ADD CONSTRAINT "ROTExecucaoLog_ROTCodigo_fkey" FOREIGN KEY ("ROTCodigo") REFERENCES "ROTRotina"("ROTCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ROTExecucaoLog" ADD CONSTRAINT "ROTExecucaoLog_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ROTHistoricoVersao" ADD CONSTRAINT "ROTHistoricoVersao_ROTCodigo_fkey" FOREIGN KEY ("ROTCodigo") REFERENCES "ROTRotina"("ROTCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ROTHistoricoVersao" ADD CONSTRAINT "ROTHistoricoVersao_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "USRUsuario"("USRCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;
