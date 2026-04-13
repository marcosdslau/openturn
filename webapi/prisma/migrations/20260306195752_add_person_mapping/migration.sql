-- CreateTable
CREATE TABLE "PESEquipamentoMapeamento" (
    "PEQCodigo" SERIAL NOT NULL,
    "PESCodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "PEQIdNoEquipamento" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PESEquipamentoMapeamento_pkey" PRIMARY KEY ("PEQCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "PESEquipamentoMapeamento_PESCodigo_EQPCodigo_key" ON "PESEquipamentoMapeamento"("PESCodigo", "EQPCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "PESEquipamentoMapeamento_EQPCodigo_PEQIdNoEquipamento_key" ON "PESEquipamentoMapeamento"("EQPCodigo", "PEQIdNoEquipamento");

-- AddForeignKey
ALTER TABLE "PESEquipamentoMapeamento" ADD CONSTRAINT "PESEquipamentoMapeamento_PESCodigo_fkey" FOREIGN KEY ("PESCodigo") REFERENCES "PESPessoa"("PESCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PESEquipamentoMapeamento" ADD CONSTRAINT "PESEquipamentoMapeamento_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;
