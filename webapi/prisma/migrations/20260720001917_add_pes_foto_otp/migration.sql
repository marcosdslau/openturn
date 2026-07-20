-- CreateTable
CREATE TABLE "PESFotoOtp" (
    "POTCodigo" SERIAL NOT NULL,
    "PESCodigo" INTEGER NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "POTCodigoHash" TEXT NOT NULL,
    "POTTentativas" INTEGER NOT NULL DEFAULT 0,
    "POTExpiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PESFotoOtp_pkey" PRIMARY KEY ("POTCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "PESFotoOtp_POTCodigoHash_key" ON "PESFotoOtp"("POTCodigoHash");

-- CreateIndex
CREATE INDEX "PESFotoOtp_PESCodigo_INSInstituicaoCodigo_idx" ON "PESFotoOtp"("PESCodigo", "INSInstituicaoCodigo");

-- AddForeignKey
ALTER TABLE "PESFotoOtp" ADD CONSTRAINT "PESFotoOtp_PESCodigo_fkey" FOREIGN KEY ("PESCodigo") REFERENCES "PESPessoa"("PESCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PESFotoOtp" ADD CONSTRAINT "PESFotoOtp_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;
