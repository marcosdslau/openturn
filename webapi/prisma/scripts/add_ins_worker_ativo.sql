-- Idempotente: corrige banco quando a migração Prisma não foi aplicada na ordem esperada.
ALTER TABLE "INSInstituicao" ADD COLUMN IF NOT EXISTS "INSWorkerAtivo" BOOLEAN NOT NULL DEFAULT true;
