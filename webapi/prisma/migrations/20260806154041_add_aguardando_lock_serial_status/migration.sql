-- AlterEnum
ALTER TYPE "StatusExecucao" ADD VALUE 'AGUARDANDO_LOCK_SERIAL';

-- AlterTable
ALTER TABLE "ROTExecucaoLog" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ROTExecucaoLog_EXEStatus_updatedAt_idx" ON "ROTExecucaoLog"("EXEStatus", "updatedAt");
