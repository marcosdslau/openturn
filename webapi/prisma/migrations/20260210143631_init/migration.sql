-- CreateEnum
CREATE TYPE "GrupoAcesso" AS ENUM ('SUPER_ROOT', 'SUPER_ADMIN', 'ADMIN', 'GESTOR', 'OPERACAO');

-- CreateTable
CREATE TABLE "CLICliente" (
    "CLICodigo" SERIAL NOT NULL,
    "CLINome" TEXT NOT NULL,
    "CLIDocumento" TEXT,
    "CLIAtivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CLICliente_pkey" PRIMARY KEY ("CLICodigo")
);

-- CreateTable
CREATE TABLE "INSInstituicao" (
    "INSCodigo" SERIAL NOT NULL,
    "CLICodigo" INTEGER NOT NULL,
    "INSNome" TEXT NOT NULL,
    "INSCodigoExterno" TEXT,
    "INSAtivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "INSInstituicao_pkey" PRIMARY KEY ("INSCodigo")
);

-- CreateTable
CREATE TABLE "PESPessoa" (
    "PESCodigo" SERIAL NOT NULL,
    "PESIdExterno" TEXT,
    "PESNome" TEXT NOT NULL,
    "PESNomeSocial" TEXT,
    "PESDocumento" TEXT,
    "PESEmail" TEXT,
    "PESTelefone" TEXT,
    "PESCelular" TEXT,
    "PESFotoBase64" TEXT,
    "PESFotoExtensao" TEXT,
    "PESGrupo" TEXT,
    "PESCartaoTag" TEXT,
    "PESAtivo" BOOLEAN NOT NULL DEFAULT true,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PESPessoa_pkey" PRIMARY KEY ("PESCodigo")
);

-- CreateTable
CREATE TABLE "MATMatricula" (
    "MATCodigo" SERIAL NOT NULL,
    "PESCodigo" INTEGER NOT NULL,
    "MATNumero" TEXT NOT NULL,
    "MATCurso" TEXT,
    "MATSerie" TEXT,
    "MATTurma" TEXT,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MATMatricula_pkey" PRIMARY KEY ("MATCodigo")
);

-- CreateTable
CREATE TABLE "EQPEquipamento" (
    "EQPCodigo" SERIAL NOT NULL,
    "EQPDescricao" TEXT,
    "EQPMarca" TEXT,
    "EQPModelo" TEXT,
    "EQPEnderecoIp" TEXT,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EQPEquipamento_pkey" PRIMARY KEY ("EQPCodigo")
);

-- CreateTable
CREATE TABLE "ERPConfiguracao" (
    "ERPCodigo" SERIAL NOT NULL,
    "ERPSistema" TEXT NOT NULL,
    "ERPUrlBase" TEXT,
    "ERPToken" TEXT,
    "ERPConfigJson" JSONB,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ERPConfiguracao_pkey" PRIMARY KEY ("ERPCodigo")
);

-- CreateTable
CREATE TABLE "USRUsuario" (
    "USRCodigo" SERIAL NOT NULL,
    "USRNome" TEXT NOT NULL,
    "USREmail" TEXT NOT NULL,
    "USRSenha" TEXT NOT NULL,
    "USRGrupo" "GrupoAcesso" NOT NULL,
    "CLICodigo" INTEGER,
    "INSCodigo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "USRUsuario_pkey" PRIMARY KEY ("USRCodigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "CLICliente_CLIDocumento_key" ON "CLICliente"("CLIDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "PESPessoa_PESDocumento_key" ON "PESPessoa"("PESDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "USRUsuario_USREmail_key" ON "USRUsuario"("USREmail");

-- AddForeignKey
ALTER TABLE "INSInstituicao" ADD CONSTRAINT "INSInstituicao_CLICodigo_fkey" FOREIGN KEY ("CLICodigo") REFERENCES "CLICliente"("CLICodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PESPessoa" ADD CONSTRAINT "PESPessoa_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MATMatricula" ADD CONSTRAINT "MATMatricula_PESCodigo_fkey" FOREIGN KEY ("PESCodigo") REFERENCES "PESPessoa"("PESCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MATMatricula" ADD CONSTRAINT "MATMatricula_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EQPEquipamento" ADD CONSTRAINT "EQPEquipamento_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ERPConfiguracao" ADD CONSTRAINT "ERPConfiguracao_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "USRUsuario" ADD CONSTRAINT "USRUsuario_CLICodigo_fkey" FOREIGN KEY ("CLICodigo") REFERENCES "CLICliente"("CLICodigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "USRUsuario" ADD CONSTRAINT "USRUsuario_INSCodigo_fkey" FOREIGN KEY ("INSCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE SET NULL ON UPDATE CASCADE;
