-- Espelho da configuração de acesso por equipamento (fase 1 do plano).
-- docs/controle-por-turma/PLANO-IMPLEMENTACAO.md §3. Puramente aditiva: nenhuma tabela
-- existente é alterada e nada é escrito em equipamento.

-- CreateTable
CREATE TABLE "AREArea" (
    "ARECodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "AREIdDevice" TEXT NOT NULL,
    "ARENome" TEXT NOT NULL,
    "ARELidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AREArea_pkey" PRIMARY KEY ("ARECodigo")
);

-- CreateTable
CREATE TABLE "PTLPortal" (
    "PTLCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "PTLIdDevice" TEXT NOT NULL,
    "PTLNome" TEXT NOT NULL,
    "PTLAreaDeCodigo" INTEGER,
    "PTLAreaParaCodigo" INTEGER,
    "PTLLidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PTLPortal_pkey" PRIMARY KEY ("PTLCodigo")
);

-- CreateTable
CREATE TABLE "HORHorario" (
    "HORCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "HORIdDevice" TEXT NOT NULL,
    "HORNome" TEXT NOT NULL,
    "HORLidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HORHorario_pkey" PRIMARY KEY ("HORCodigo")
);

-- CreateTable
CREATE TABLE "HORJanela" (
    "HRJCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "HORCodigo" INTEGER NOT NULL,
    "HRJInicioSeg" INTEGER NOT NULL,
    "HRJFimSeg" INTEGER NOT NULL,
    "HRJDom" BOOLEAN NOT NULL DEFAULT false,
    "HRJSeg" BOOLEAN NOT NULL DEFAULT false,
    "HRJTer" BOOLEAN NOT NULL DEFAULT false,
    "HRJQua" BOOLEAN NOT NULL DEFAULT false,
    "HRJQui" BOOLEAN NOT NULL DEFAULT false,
    "HRJSex" BOOLEAN NOT NULL DEFAULT false,
    "HRJSab" BOOLEAN NOT NULL DEFAULT false,
    "HRJFeriado1" BOOLEAN NOT NULL DEFAULT false,
    "HRJFeriado2" BOOLEAN NOT NULL DEFAULT false,
    "HRJFeriado3" BOOLEAN NOT NULL DEFAULT false,
    "HRJOrdem" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "HORJanela_pkey" PRIMARY KEY ("HRJCodigo")
);

-- CreateTable
CREATE TABLE "HRAHorarioArea" (
    "HRACodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "HORCodigo" INTEGER NOT NULL,
    "ARECodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HRAHorarioArea_pkey" PRIMARY KEY ("HRACodigo")
);

-- CreateTable
CREATE TABLE "DEPDepartamento" (
    "DEPCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "DEPNome" TEXT NOT NULL,
    "DEPDescricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DEPDepartamento_pkey" PRIMARY KEY ("DEPCodigo")
);

-- CreateTable
CREATE TABLE "DEQDepartamentoEquipamento" (
    "DEQCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "DEPCodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "DEQIdDevice" TEXT NOT NULL,
    "DEQNome" TEXT NOT NULL,
    "DEQRevisadoEm" TIMESTAMP(3),
    "USRCodigoRevisao" INTEGER,
    "DEQSyncHash" TEXT,
    "DEQVerificadoEm" TIMESTAMP(3),
    "DEQUltimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DEQDepartamentoEquipamento_pkey" PRIMARY KEY ("DEQCodigo")
);

-- CreateTable
CREATE TABLE "DRGDepartamentoRegra" (
    "DRGCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "DEQCodigo" INTEGER NOT NULL,
    "HORCodigo" INTEGER NOT NULL,
    "DRGIdRegraDevice" TEXT,
    "DRGNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DRGDepartamentoRegra_pkey" PRIMARY KEY ("DRGCodigo")
);

-- CreateTable
CREATE TABLE "DRADepartamentoRegraArea" (
    "DRACodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "DRGCodigo" INTEGER NOT NULL,
    "ARECodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DRADepartamentoRegraArea_pkey" PRIMARY KEY ("DRACodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "AREArea_EQPCodigo_AREIdDevice_key" ON "AREArea"("EQPCodigo", "AREIdDevice");

-- CreateIndex
CREATE INDEX "PTLPortal_PTLAreaParaCodigo_idx" ON "PTLPortal"("PTLAreaParaCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "PTLPortal_EQPCodigo_PTLIdDevice_key" ON "PTLPortal"("EQPCodigo", "PTLIdDevice");

-- CreateIndex
CREATE UNIQUE INDEX "HORHorario_EQPCodigo_HORIdDevice_key" ON "HORHorario"("EQPCodigo", "HORIdDevice");

-- CreateIndex
CREATE INDEX "HORJanela_HORCodigo_idx" ON "HORJanela"("HORCodigo");

-- CreateIndex
CREATE INDEX "HRAHorarioArea_ARECodigo_idx" ON "HRAHorarioArea"("ARECodigo");

-- CreateIndex
CREATE UNIQUE INDEX "HRAHorarioArea_HORCodigo_ARECodigo_key" ON "HRAHorarioArea"("HORCodigo", "ARECodigo");

-- CreateIndex
CREATE UNIQUE INDEX "DEPDepartamento_INSInstituicaoCodigo_DEPNome_key" ON "DEPDepartamento"("INSInstituicaoCodigo", "DEPNome");

-- CreateIndex
CREATE UNIQUE INDEX "DEQDepartamentoEquipamento_EQPCodigo_DEQIdDevice_key" ON "DEQDepartamentoEquipamento"("EQPCodigo", "DEQIdDevice");

-- CreateIndex
CREATE UNIQUE INDEX "DEQDepartamentoEquipamento_DEPCodigo_EQPCodigo_key" ON "DEQDepartamentoEquipamento"("DEPCodigo", "EQPCodigo");

-- CreateIndex
CREATE INDEX "DRGDepartamentoRegra_HORCodigo_idx" ON "DRGDepartamentoRegra"("HORCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "DRGDepartamentoRegra_DEQCodigo_HORCodigo_key" ON "DRGDepartamentoRegra"("DEQCodigo", "HORCodigo");

-- CreateIndex
CREATE INDEX "DRADepartamentoRegraArea_ARECodigo_idx" ON "DRADepartamentoRegraArea"("ARECodigo");

-- CreateIndex
CREATE UNIQUE INDEX "DRADepartamentoRegraArea_DRGCodigo_ARECodigo_key" ON "DRADepartamentoRegraArea"("DRGCodigo", "ARECodigo");

-- AddForeignKey
ALTER TABLE "AREArea" ADD CONSTRAINT "AREArea_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AREArea" ADD CONSTRAINT "AREArea_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTLPortal" ADD CONSTRAINT "PTLPortal_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTLPortal" ADD CONSTRAINT "PTLPortal_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTLPortal" ADD CONSTRAINT "PTLPortal_PTLAreaDeCodigo_fkey" FOREIGN KEY ("PTLAreaDeCodigo") REFERENCES "AREArea"("ARECodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTLPortal" ADD CONSTRAINT "PTLPortal_PTLAreaParaCodigo_fkey" FOREIGN KEY ("PTLAreaParaCodigo") REFERENCES "AREArea"("ARECodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HORHorario" ADD CONSTRAINT "HORHorario_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HORHorario" ADD CONSTRAINT "HORHorario_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HORJanela" ADD CONSTRAINT "HORJanela_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HORJanela" ADD CONSTRAINT "HORJanela_HORCodigo_fkey" FOREIGN KEY ("HORCodigo") REFERENCES "HORHorario"("HORCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRAHorarioArea" ADD CONSTRAINT "HRAHorarioArea_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRAHorarioArea" ADD CONSTRAINT "HRAHorarioArea_HORCodigo_fkey" FOREIGN KEY ("HORCodigo") REFERENCES "HORHorario"("HORCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRAHorarioArea" ADD CONSTRAINT "HRAHorarioArea_ARECodigo_fkey" FOREIGN KEY ("ARECodigo") REFERENCES "AREArea"("ARECodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DEPDepartamento" ADD CONSTRAINT "DEPDepartamento_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DEQDepartamentoEquipamento" ADD CONSTRAINT "DEQDepartamentoEquipamento_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DEQDepartamentoEquipamento" ADD CONSTRAINT "DEQDepartamentoEquipamento_DEPCodigo_fkey" FOREIGN KEY ("DEPCodigo") REFERENCES "DEPDepartamento"("DEPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DEQDepartamentoEquipamento" ADD CONSTRAINT "DEQDepartamentoEquipamento_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DEQDepartamentoEquipamento" ADD CONSTRAINT "DEQDepartamentoEquipamento_USRCodigoRevisao_fkey" FOREIGN KEY ("USRCodigoRevisao") REFERENCES "USRUsuario"("USRCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRGDepartamentoRegra" ADD CONSTRAINT "DRGDepartamentoRegra_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRGDepartamentoRegra" ADD CONSTRAINT "DRGDepartamentoRegra_DEQCodigo_fkey" FOREIGN KEY ("DEQCodigo") REFERENCES "DEQDepartamentoEquipamento"("DEQCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRGDepartamentoRegra" ADD CONSTRAINT "DRGDepartamentoRegra_HORCodigo_fkey" FOREIGN KEY ("HORCodigo") REFERENCES "HORHorario"("HORCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRADepartamentoRegraArea" ADD CONSTRAINT "DRADepartamentoRegraArea_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRADepartamentoRegraArea" ADD CONSTRAINT "DRADepartamentoRegraArea_DRGCodigo_fkey" FOREIGN KEY ("DRGCodigo") REFERENCES "DRGDepartamentoRegra"("DRGCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRADepartamentoRegraArea" ADD CONSTRAINT "DRADepartamentoRegraArea_ARECodigo_fkey" FOREIGN KEY ("ARECodigo") REFERENCES "AREArea"("ARECodigo") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sequências das tabelas novas começam em 100 (mesmo critério de 20260524120000_sequences_start_at_100).
SELECT setval(pg_get_serial_sequence('"AREArea"', 'ARECodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"PTLPortal"', 'PTLCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"HORHorario"', 'HORCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"HORJanela"', 'HRJCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"HRAHorarioArea"', 'HRACodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"DEPDepartamento"', 'DEPCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"DEQDepartamentoEquipamento"', 'DEQCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"DRGDepartamentoRegra"', 'DRGCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"DRADepartamentoRegraArea"', 'DRACodigo'), 100, false);
