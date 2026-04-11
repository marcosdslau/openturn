-- AlterTable
ALTER TABLE "INSInstituicao" ADD COLUMN "INSControlidMonitorRotinaAtiva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "INSInstituicao" ADD COLUMN "INSControlidMonitorRotinaCodigo" INTEGER;

-- AddForeignKey
ALTER TABLE "INSInstituicao" ADD CONSTRAINT "INSInstituicao_INSControlidMonitorRotinaCodigo_fkey" FOREIGN KEY ("INSControlidMonitorRotinaCodigo") REFERENCES "ROTRotina"("ROTCodigo") ON DELETE SET NULL ON UPDATE CASCADE;
