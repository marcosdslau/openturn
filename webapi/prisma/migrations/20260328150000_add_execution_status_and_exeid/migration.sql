-- AlterEnum
ALTER TYPE "StatusExecucao" ADD VALUE 'EM_EXECUCAO';
ALTER TYPE "StatusExecucao" ADD VALUE 'CANCELADO';

-- AlterTable
ALTER TABLE "ROTExecucaoLog" ADD COLUMN "EXEIdExterno" TEXT;

-- Backfill existing rows with UUIDs
UPDATE "ROTExecucaoLog" SET "EXEIdExterno" = gen_random_uuid()::text WHERE "EXEIdExterno" IS NULL;

-- Make NOT NULL + unique
ALTER TABLE "ROTExecucaoLog" ALTER COLUMN "EXEIdExterno" SET NOT NULL;
ALTER TABLE "ROTExecucaoLog" ALTER COLUMN "EXEIdExterno" SET DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE UNIQUE INDEX "ROTExecucaoLog_EXEIdExterno_key" ON "ROTExecucaoLog"("EXEIdExterno");
