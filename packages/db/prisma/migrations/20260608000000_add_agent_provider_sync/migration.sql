CREATE TYPE "AgentProvider" AS ENUM ('elevenlabs_agents', 'openai_realtime', 'none');

CREATE TYPE "ProviderSyncStatus" AS ENUM ('not_synced', 'synced', 'failed');

ALTER TABLE "AvatarAgent"
ADD COLUMN "agentProvider" "AgentProvider" NOT NULL DEFAULT 'elevenlabs_agents',
ADD COLUMN "providerAgentId" TEXT,
ADD COLUMN "providerSyncStatus" "ProviderSyncStatus" NOT NULL DEFAULT 'not_synced',
ADD COLUMN "providerSyncError" TEXT,
ADD COLUMN "providerSyncedAt" TIMESTAMP(3),
ADD COLUMN "providerSyncFingerprint" TEXT;

CREATE INDEX "AvatarAgent_agentProvider_providerSyncStatus_idx" ON "AvatarAgent"("agentProvider", "providerSyncStatus");
