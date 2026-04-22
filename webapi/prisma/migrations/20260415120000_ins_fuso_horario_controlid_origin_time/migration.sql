-- Fuso horário por instituição (default -3)
ALTER TABLE "INSInstituicao" ADD COLUMN IF NOT EXISTS "INSFusoHorario" INTEGER NOT NULL DEFAULT -3;

-- ControlID: tempo bruto estável + tempo ajustado ao fuso no ingest
ALTER TABLE "controlid_dao" ADD COLUMN IF NOT EXISTS "origin_time" BIGINT;
ALTER TABLE "controlid_catra_event" ADD COLUMN IF NOT EXISTS "origin_time" BIGINT;

-- Backfill: coluna time legada = bruto do webhook (= origin)
UPDATE "controlid_dao" SET "origin_time" = "time" WHERE "origin_time" IS NULL;
UPDATE "controlid_catra_event" SET "origin_time" = "time" WHERE "origin_time" IS NULL;

-- time passa a ser notifyTime = origin + fuso (horas → segundos)
UPDATE "controlid_dao" AS d
SET "time" = d."origin_time" + COALESCE(i."INSFusoHorario", -3) * 3600
FROM "INSInstituicao" AS i
WHERE i."INSCodigo" = d."INSInstituicaoCodigo";

UPDATE "controlid_catra_event" AS c
SET "time" = c."origin_time" + COALESCE(i."INSFusoHorario", -3) * 3600
FROM "INSInstituicao" AS i
WHERE i."INSCodigo" = c."INSInstituicaoCodigo";

ALTER TABLE "controlid_dao" ALTER COLUMN "origin_time" SET NOT NULL;
ALTER TABLE "controlid_catra_event" ALTER COLUMN "origin_time" SET NOT NULL;

DROP INDEX IF EXISTS "controlid_dao_INSInstituicaoCodigo_device_id_time_idx";
DROP INDEX IF EXISTS "controlid_catra_event_INSInstituicaoCodigo_device_id_time_idx";

CREATE INDEX "controlid_dao_INSInstituicaoCodigo_device_id_origin_time_idx" ON "controlid_dao"("INSInstituicaoCodigo", "device_id", "origin_time");
CREATE INDEX "controlid_catra_event_INSInstituicaoCodigo_device_id_origin_time_idx" ON "controlid_catra_event"("INSInstituicaoCodigo", "device_id", "origin_time");

CREATE INDEX "controlid_dao_INSInstituicaoCodigo_device_id_time_idx" ON "controlid_dao"("INSInstituicaoCodigo", "device_id", "time");
CREATE INDEX "controlid_catra_event_INSInstituicaoCodigo_device_id_time_idx" ON "controlid_catra_event"("INSInstituicaoCodigo", "device_id", "time");
