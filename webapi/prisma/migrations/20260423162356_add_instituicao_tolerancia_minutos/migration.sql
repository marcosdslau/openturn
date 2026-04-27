-- DropIndex
DROP INDEX "ROTExecucaoLog_exeInicio_idx";

-- DropIndex
DROP INDEX "ROTExecucaoLog_ins_exeInicio_idx";

-- AlterTable
ALTER TABLE "INSInstituicao" ADD COLUMN     "INSToleranciaEntradaMinutos" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "INSToleranciaSaidaMinutos" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "ROTExecucaoLog" ALTER COLUMN "EXEIdExterno" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "controlid_catra_event_INSInstituicaoCodigo_device_id_origin_tim" RENAME TO "controlid_catra_event_INSInstituicaoCodigo_device_id_origin_idx";
