ALTER TABLE "RealtimeSession"
ADD COLUMN "providerSessionTokenCiphertext" TEXT;

CREATE INDEX "PublicSession_status_expiresAt_idx"
ON "PublicSession"("status", "expiresAt");
