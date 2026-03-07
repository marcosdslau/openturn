/*
  Warnings:

  - A unique constraint covering the columns `[INSInstituicaoCodigo,ROTWebhookPath,ROTWebhookMetodo]` on the table `ROTRotina` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ROTRotina_INSInstituicaoCodigo_ROTWebhookPath_ROTWebhookMet_key" ON "ROTRotina"("INSInstituicaoCodigo", "ROTWebhookPath", "ROTWebhookMetodo");
