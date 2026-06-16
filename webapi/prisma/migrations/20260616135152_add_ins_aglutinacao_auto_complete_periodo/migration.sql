-- DropForeignKey
ALTER TABLE "ROTExecucaoLog" DROP CONSTRAINT "ROTExecucaoLog_ROTCodigo_fkey";

-- AlterTable
ALTER TABLE "INSInstituicao" ADD COLUMN     "INSAglutinacaoAutoCompletePeriodo" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "ROTExecucaoLog" ADD CONSTRAINT "ROTExecucaoLog_ROTCodigo_fkey" FOREIGN KEY ("ROTCodigo") REFERENCES "ROTRotina"("ROTCodigo") ON DELETE SET NULL ON UPDATE CASCADE;
