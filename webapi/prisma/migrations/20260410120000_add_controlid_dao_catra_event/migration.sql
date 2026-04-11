-- Tenant helper for RLS (idempotent; may already exist from setup-rls.sql)
CREATE OR REPLACE FUNCTION current_tenant() RETURNS integer AS $$
  SELECT current_setting('app.current_tenant', true)::integer;
$$ LANGUAGE sql STABLE;

-- CreateTable
CREATE TABLE "controlid_dao" (
    "CTDCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "time" BIGINT NOT NULL,
    "object" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "values_id" TEXT,
    "values_time" TEXT,
    "values_event" TEXT,
    "values_device_id" TEXT,
    "values_identifier_id" TEXT,
    "values_user_id" TEXT,
    "values_portal_id" TEXT,
    "values_identification_rule_id" TEXT,
    "values_card_value" TEXT,
    "values_qrcode_value" TEXT,
    "values_pin_value" TEXT,
    "values_confidence" TEXT,
    "values_mask" TEXT,
    "values_log_type_id" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controlid_dao_pkey" PRIMARY KEY ("CTDCodigo")
);

-- CreateTable
CREATE TABLE "controlid_catra_event" (
    "CTCCodigo" SERIAL NOT NULL,
    "INSInstituicaoCodigo" INTEGER NOT NULL,
    "device_id" TEXT NOT NULL,
    "time" BIGINT NOT NULL,
    "access_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_name" TEXT,
    "event_time" BIGINT,
    "event_uuid" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controlid_catra_event_pkey" PRIMARY KEY ("CTCCodigo")
);

-- CreateIndex
CREATE INDEX "controlid_dao_INSInstituicaoCodigo_processed_idx" ON "controlid_dao"("INSInstituicaoCodigo", "processed");

-- CreateIndex
CREATE INDEX "controlid_dao_INSInstituicaoCodigo_device_id_time_idx" ON "controlid_dao"("INSInstituicaoCodigo", "device_id", "time");

-- CreateIndex
CREATE INDEX "controlid_catra_event_INSInstituicaoCodigo_processed_idx" ON "controlid_catra_event"("INSInstituicaoCodigo", "processed");

-- CreateIndex
CREATE INDEX "controlid_catra_event_INSInstituicaoCodigo_device_id_time_idx" ON "controlid_catra_event"("INSInstituicaoCodigo", "device_id", "time");

-- AddForeignKey
ALTER TABLE "controlid_dao" ADD CONSTRAINT "controlid_dao_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controlid_catra_event" ADD CONSTRAINT "controlid_catra_event_INSInstituicaoCodigo_fkey" FOREIGN KEY ("INSInstituicaoCodigo") REFERENCES "INSInstituicao"("INSCodigo") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (tenant = instituição)
ALTER TABLE "controlid_dao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ctl_dao ON "controlid_dao"
  USING ("INSInstituicaoCodigo" = current_tenant());

ALTER TABLE "controlid_catra_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ctl_catra ON "controlid_catra_event"
  USING ("INSInstituicaoCodigo" = current_tenant());
