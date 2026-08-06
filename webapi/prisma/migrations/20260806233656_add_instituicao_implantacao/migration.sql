-- AlterTable
ALTER TABLE "INSInstituicao" ADD COLUMN     "INSDataGoLive" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "INSImplantacao" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CIMCursosImplantacao" (
    "CIMCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "CIMCurso" TEXT NOT NULL,
    "CIMSerie" TEXT NOT NULL,
    "CIMTurma" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CIMCursosImplantacao_pkey" PRIMARY KEY ("CIMCodigo")
);

-- CreateIndex
CREATE INDEX "CIMCursosImplantacao_INSInstituicaoCodigo_idx" ON "CIMCursosImplantacao"("INSInstituicaoCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "CIMCursosImplantacao_INSInstituicaoCodigo_CIMCurso_CIMSerie_key" ON "CIMCursosImplantacao"("INSInstituicaoCodigo", "CIMCurso", "CIMSerie", "CIMTurma");

-- AddForeignKey
ALTER TABLE "CIMCursosImplantacao" ADD CONSTRAINT "CIMCursosImplantacao_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;
