-- AlterTable
ALTER TABLE "PESPessoa" ADD COLUMN IF NOT EXISTS "PESImageError" JSONB;

-- Tenant helper for RLS (idempotent; may already exist from setup-rls.sql)
CREATE OR REPLACE FUNCTION current_tenant() RETURNS integer AS $$
  SELECT current_setting('app.current_tenant', true)::integer;
$$ LANGUAGE sql STABLE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "NOTNotificacao" (
    "NOTCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER,
    "ckey" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "chaveOrigem" TEXT NOT NULL,
    "lido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NOTNotificacao_pkey" PRIMARY KEY ("NOTCodigo")
);

-- Ensure column exists (for drifted DBs where table already exists)
ALTER TABLE "NOTNotificacao" ADD COLUMN IF NOT EXISTS "INSInstituicaoCodigo" INTEGER;

-- Backfill institution when possible (known origin: imagem_control_id => chaveOrigem = PESCodigo)
UPDATE "NOTNotificacao" n
SET "INSInstituicaoCodigo" = p."INSInstituicaoCodigo"
FROM "PESPessoa" p
WHERE n."INSInstituicaoCodigo" IS NULL
  AND n."origem" = 'imagem_control_id'
  AND p."PESCodigo" = (n."chaveOrigem")::integer;

-- Remove legacy rows that cannot be safely attributed to any institution
DELETE FROM "NOTNotificacao"
WHERE "INSInstituicaoCodigo" IS NULL;

-- Enforce mandatory institution link
ALTER TABLE "NOTNotificacao" ALTER COLUMN "INSInstituicaoCodigo" SET NOT NULL;

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'NOTNotificacao_INSInstituicaoCodigo_fkey'
  ) THEN
    ALTER TABLE "NOTNotificacao"
      ADD CONSTRAINT "NOTNotificacao_INSInstituicaoCodigo_fkey"
      FOREIGN KEY ("INSInstituicaoCodigo")
      REFERENCES "INSInstituicao"("INSCodigo")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Enforce tenant consistency (auxiliary trigger for RLS)
CREATE OR REPLACE FUNCTION enforce_notificacao_tenant() RETURNS trigger AS $$
BEGIN
  IF current_tenant() IS NULL THEN
    RAISE EXCEPTION 'Tenant não definido (app.current_tenant)';
  END IF;

  IF NEW."INSInstituicaoCodigo" IS NULL THEN
    NEW."INSInstituicaoCodigo" := current_tenant();
  END IF;

  IF NEW."INSInstituicaoCodigo" <> current_tenant() THEN
    RAISE EXCEPTION 'Instituição da notificação (%s) não corresponde ao tenant atual (%s)', NEW."INSInstituicaoCodigo", current_tenant();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_notificacao_enforce_tenant'
  ) THEN
    DROP TRIGGER trg_notificacao_enforce_tenant ON "NOTNotificacao";
  END IF;
  CREATE TRIGGER trg_notificacao_enforce_tenant
  BEFORE INSERT OR UPDATE ON "NOTNotificacao"
  FOR EACH ROW EXECUTE FUNCTION enforce_notificacao_tenant();
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NOTNotificacao_ckey_key" ON "NOTNotificacao"("ckey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NOTNotificacao_INSInstituicaoCodigo_lido_updatedAt_idx" ON "NOTNotificacao"("INSInstituicaoCodigo", "lido", "updatedAt");

-- RLS (tenant = instituição)
ALTER TABLE "NOTNotificacao" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_notificacao ON "NOTNotificacao";
CREATE POLICY tenant_isolation_notificacao ON "NOTNotificacao"
  FOR ALL
  USING ("INSInstituicaoCodigo" = current_tenant())
  WITH CHECK ("INSInstituicaoCodigo" = current_tenant());
