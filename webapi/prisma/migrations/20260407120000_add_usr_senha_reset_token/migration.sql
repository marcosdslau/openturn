-- CreateTable
CREATE TABLE "USRSenhaResetToken" (
    "USRSTCodigo" SERIAL NOT NULL,
    "USRCodigo" INTEGER NOT NULL,
    "USRTokenHash" TEXT NOT NULL,
    "USRTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "USRSenhaResetToken_pkey" PRIMARY KEY ("USRSTCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "USRSenhaResetToken_USRTokenHash_key" ON "USRSenhaResetToken"("USRTokenHash");

-- CreateIndex
CREATE INDEX "USRSenhaResetToken_USRCodigo_idx" ON "USRSenhaResetToken"("USRCodigo");

-- AddForeignKey
ALTER TABLE "USRSenhaResetToken" ADD CONSTRAINT "USRSenhaResetToken_USRCodigo_fkey" FOREIGN KEY ("USRCodigo") REFERENCES "USRUsuario"("USRCodigo") ON DELETE CASCADE ON UPDATE CASCADE;
