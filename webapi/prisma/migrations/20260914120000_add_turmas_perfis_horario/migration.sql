-- AlterTable
ALTER TABLE "PESPessoa" ADD COLUMN     "PESGrupoHorario" TEXT,
ADD COLUMN     "PESTRMCodigo" INTEGER;

-- AlterTable
ALTER TABLE "MATMatricula" ADD COLUMN     "TRMCodigo" INTEGER;

-- CreateTable
CREATE TABLE "TRMTurma" (
    "TRMCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "TRMIdExterno" TEXT NOT NULL,
    "TRMIdOferta" TEXT,
    "TRMTurma" TEXT NOT NULL,
    "TRMCurso" TEXT,
    "TRMSerie" TEXT,
    "TRMCurriculo" TEXT,
    "TRMTurno" TEXT,
    "TRMAnoReferencia" TEXT,
    "TRMCalendario" TEXT,
    "TRMDataInicio" TIMESTAMP(3),
    "TRMDataFim" TIMESTAMP(3),
    "PHACodigo" INTEGER,
    "TRMValidacaoAtiva" BOOLEAN NOT NULL DEFAULT false,
    "TRMTodosEquipamentos" BOOLEAN NOT NULL DEFAULT true,
    "TRMAtiva" BOOLEAN NOT NULL DEFAULT true,
    "TRMPrioridade" INTEGER NOT NULL DEFAULT 0,
    "TRMQtdePessoas" INTEGER NOT NULL DEFAULT 0,
    "USRCodigoAlteracao" INTEGER,
    "ROTCodigoAlteracao" INTEGER,
    "TRMAlteradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TRMTurma_pkey" PRIMARY KEY ("TRMCodigo")
);

-- CreateTable
CREATE TABLE "PHAPerfilHorario" (
    "PHACodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "PHANome" TEXT NOT NULL,
    "PHAHashJanelas" TEXT NOT NULL,
    "PHAHashConfig" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PHAPerfilHorario_pkey" PRIMARY KEY ("PHACodigo")
);

-- CreateTable
CREATE TABLE "PHAJanela" (
    "PHJCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "PHACodigo" INTEGER NOT NULL,
    "PHJHoraInicio" TEXT NOT NULL,
    "PHJHoraFim" TEXT NOT NULL,
    "PHJDom" BOOLEAN NOT NULL DEFAULT false,
    "PHJSeg" BOOLEAN NOT NULL DEFAULT false,
    "PHJTer" BOOLEAN NOT NULL DEFAULT false,
    "PHJQua" BOOLEAN NOT NULL DEFAULT false,
    "PHJQui" BOOLEAN NOT NULL DEFAULT false,
    "PHJSex" BOOLEAN NOT NULL DEFAULT false,
    "PHJSab" BOOLEAN NOT NULL DEFAULT false,
    "PHJFeriado1" BOOLEAN NOT NULL DEFAULT false,
    "PHJFeriado2" BOOLEAN NOT NULL DEFAULT false,
    "PHJFeriado3" BOOLEAN NOT NULL DEFAULT false,
    "PHJOrdem" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PHAJanela_pkey" PRIMARY KEY ("PHJCodigo")
);

-- CreateTable
CREATE TABLE "TEQTurmaEquipamento" (
    "TEQCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "TRMCodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TEQTurmaEquipamento_pkey" PRIMARY KEY ("TEQCodigo")
);

-- CreateTable
CREATE TABLE "PHEPerfilEquipamento" (
    "PHECodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "PHACodigo" INTEGER NOT NULL,
    "EQPCodigo" INTEGER NOT NULL,
    "PHEIdGrupo" TEXT,
    "PHEIdRegraAcesso" TEXT,
    "PHEIdHorario" TEXT,
    "PHESyncHash" TEXT,
    "PHESyncedAt" TIMESTAMP(3),
    "PHEUltimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PHEPerfilEquipamento_pkey" PRIMARY KEY ("PHECodigo")
);

-- CreateIndex
CREATE INDEX "TRMTurma_INSInstituicaoCodigo_TRMValidacaoAtiva_idx" ON "TRMTurma"("INSInstituicaoCodigo", "TRMValidacaoAtiva");

-- CreateIndex
CREATE INDEX "TRMTurma_PHACodigo_idx" ON "TRMTurma"("PHACodigo");

-- CreateIndex
CREATE UNIQUE INDEX "TRMTurma_INSInstituicaoCodigo_TRMIdExterno_key" ON "TRMTurma"("INSInstituicaoCodigo", "TRMIdExterno");

-- CreateIndex
CREATE UNIQUE INDEX "PHAPerfilHorario_INSInstituicaoCodigo_PHAHashJanelas_key" ON "PHAPerfilHorario"("INSInstituicaoCodigo", "PHAHashJanelas");

-- CreateIndex
CREATE UNIQUE INDEX "PHAPerfilHorario_INSInstituicaoCodigo_PHANome_key" ON "PHAPerfilHorario"("INSInstituicaoCodigo", "PHANome");

-- CreateIndex
CREATE INDEX "PHAJanela_PHACodigo_idx" ON "PHAJanela"("PHACodigo");

-- CreateIndex
CREATE INDEX "TEQTurmaEquipamento_EQPCodigo_idx" ON "TEQTurmaEquipamento"("EQPCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "TEQTurmaEquipamento_TRMCodigo_EQPCodigo_key" ON "TEQTurmaEquipamento"("TRMCodigo", "EQPCodigo");

-- CreateIndex
CREATE INDEX "PHEPerfilEquipamento_EQPCodigo_idx" ON "PHEPerfilEquipamento"("EQPCodigo");

-- CreateIndex
CREATE UNIQUE INDEX "PHEPerfilEquipamento_PHACodigo_EQPCodigo_key" ON "PHEPerfilEquipamento"("PHACodigo", "EQPCodigo");

-- CreateIndex
CREATE INDEX "PESPessoa_PESTRMCodigo_idx" ON "PESPessoa"("PESTRMCodigo");

-- CreateIndex
CREATE INDEX "MATMatricula_TRMCodigo_idx" ON "MATMatricula"("TRMCodigo");

-- AddForeignKey
ALTER TABLE "PESPessoa" ADD CONSTRAINT "PESPessoa_PESTRMCodigo_fkey" FOREIGN KEY ("PESTRMCodigo") REFERENCES "TRMTurma"("TRMCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MATMatricula" ADD CONSTRAINT "MATMatricula_TRMCodigo_fkey" FOREIGN KEY ("TRMCodigo") REFERENCES "TRMTurma"("TRMCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TRMTurma" ADD CONSTRAINT "TRMTurma_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TRMTurma" ADD CONSTRAINT "TRMTurma_PHACodigo_fkey" FOREIGN KEY ("PHACodigo") REFERENCES "PHAPerfilHorario"("PHACodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TRMTurma" ADD CONSTRAINT "TRMTurma_USRCodigoAlteracao_fkey" FOREIGN KEY ("USRCodigoAlteracao") REFERENCES "USRUsuario"("USRCodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PHAPerfilHorario" ADD CONSTRAINT "PHAPerfilHorario_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PHAJanela" ADD CONSTRAINT "PHAJanela_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PHAJanela" ADD CONSTRAINT "PHAJanela_PHACodigo_fkey" FOREIGN KEY ("PHACodigo") REFERENCES "PHAPerfilHorario"("PHACodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TEQTurmaEquipamento" ADD CONSTRAINT "TEQTurmaEquipamento_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TEQTurmaEquipamento" ADD CONSTRAINT "TEQTurmaEquipamento_TRMCodigo_fkey" FOREIGN KEY ("TRMCodigo") REFERENCES "TRMTurma"("TRMCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TEQTurmaEquipamento" ADD CONSTRAINT "TEQTurmaEquipamento_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PHEPerfilEquipamento" ADD CONSTRAINT "PHEPerfilEquipamento_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PHEPerfilEquipamento" ADD CONSTRAINT "PHEPerfilEquipamento_PHACodigo_fkey" FOREIGN KEY ("PHACodigo") REFERENCES "PHAPerfilHorario"("PHACodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PHEPerfilEquipamento" ADD CONSTRAINT "PHEPerfilEquipamento_EQPCodigo_fkey" FOREIGN KEY ("EQPCodigo") REFERENCES "EQPEquipamento"("EQPCodigo") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sequências das tabelas novas começam em 100 (mesmo critério de 20260524120000_sequences_start_at_100).
SELECT setval(pg_get_serial_sequence('"TRMTurma"', 'TRMCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"PHAPerfilHorario"', 'PHACodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"PHAJanela"', 'PHJCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"TEQTurmaEquipamento"', 'TEQCodigo'), 100, false);
SELECT setval(pg_get_serial_sequence('"PHEPerfilEquipamento"', 'PHECodigo'), 100, false);
