ALTER TYPE "ProviderSyncStatus" ADD VALUE IF NOT EXISTS 'syncing';

CREATE TYPE "ContextSyncStatus" AS ENUM ('pending', 'syncing', 'synced', 'failed', 'deleting');
CREATE TYPE "DocumentProviderSyncStatus" AS ENUM ('pending', 'uploading', 'indexing', 'attaching', 'synced', 'failed', 'deleting', 'deleted');

ALTER TABLE "AvatarAgent"
  ADD COLUMN "providerLastUsableAt" TIMESTAMP(3),
  ADD COLUMN "providerContextDocumentId" TEXT,
  ADD COLUMN "providerContextSyncStatus" "ContextSyncStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "providerContextFingerprint" TEXT,
  ADD COLUMN "providerContextError" TEXT,
  ADD COLUMN "providerContextSyncedAt" TIMESTAMP(3),
  ADD COLUMN "providerContextLastUsableAt" TIMESTAMP(3);

UPDATE "AvatarAgent"
SET "providerLastUsableAt" = "providerSyncedAt"
WHERE "providerAgentId" IS NOT NULL AND "providerSyncedAt" IS NOT NULL;

ALTER TABLE "Document" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "DocumentStatus" RENAME TO "DocumentStatus_old";
CREATE TYPE "DocumentStatus" AS ENUM ('pending_upload', 'processing', 'ready', 'failed', 'deleting');
ALTER TABLE "Document" ALTER COLUMN "status" TYPE "DocumentStatus"
USING (
  CASE "status"::text
    WHEN 'uploaded' THEN 'pending_upload'
    WHEN 'ingesting' THEN 'processing'
    ELSE "status"::text
  END
)::"DocumentStatus";
ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'pending_upload';
DROP TYPE "DocumentStatus_old";

ALTER TABLE "Document"
  ADD COLUMN "uploadConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "storageEtag" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "Document_avatarAgentId_idx";
CREATE INDEX "Document_avatarAgentId_deletedAt_idx" ON "Document"("avatarAgentId", "deletedAt");

CREATE TABLE "DocumentProviderSync" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "provider" "AgentProvider" NOT NULL DEFAULT 'elevenlabs_agents',
  "providerDocumentId" TEXT,
  "status" "DocumentProviderSyncStatus" NOT NULL DEFAULT 'pending',
  "ragStatus" TEXT,
  "fingerprint" TEXT,
  "errorMessage" TEXT,
  "providerLastUsableAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentProviderSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentProviderSync_documentId_key" ON "DocumentProviderSync"("documentId");
CREATE UNIQUE INDEX "DocumentProviderSync_documentId_provider_key" ON "DocumentProviderSync"("documentId", "provider");
CREATE INDEX "DocumentProviderSync_provider_status_idx" ON "DocumentProviderSync"("provider", "status");
CREATE INDEX "DocumentProviderSync_providerDocumentId_idx" ON "DocumentProviderSync"("providerDocumentId");
ALTER TABLE "DocumentProviderSync" ADD CONSTRAINT "DocumentProviderSync_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'avatar_context_provider_sync';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'document_provider_sync';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'agent_provider_sync';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'provider_document_cleanup';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'avatar_provider_cleanup';

ALTER TABLE "Job"
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedBy" TEXT;
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

ALTER TABLE "Job" DROP CONSTRAINT IF EXISTS "Job_avatarAgentId_fkey";
ALTER TABLE "Job" ADD CONSTRAINT "Job_avatarAgentId_fkey"
  FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
