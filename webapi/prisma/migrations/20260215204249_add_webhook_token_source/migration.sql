-- CreateEnum
CREATE TYPE "WebhookTokenSource" AS ENUM ('HEADER', 'QUERY');

-- AlterTable
ALTER TABLE "ROTRotina" ADD COLUMN     "ROTWebhookTokenKey" TEXT DEFAULT 'x-webhook-token',
ADD COLUMN     "ROTWebhookTokenSource" "WebhookTokenSource" DEFAULT 'HEADER';
