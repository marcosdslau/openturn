-- AlterTable
ALTER TABLE "EQPEquipamento" ADD COLUMN     "EQPConfig" JSONB,
ADD COLUMN     "EQPUltimoSincronismo" TIMESTAMP(3);
