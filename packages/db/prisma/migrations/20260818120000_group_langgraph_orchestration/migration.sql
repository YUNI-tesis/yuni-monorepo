-- Persistent, server-authoritative orchestration for bounded group rounds.
CREATE TYPE "GroupOrchestrationPhase" AS ENUM ('listening', 'deliberating', 'queued', 'speaking', 'committing', 'ended', 'errored');
CREATE TYPE "GroupVoiceRoundStatus" AS ENUM ('deliberating', 'queued', 'speaking', 'completed', 'cancelled', 'failed');
CREATE TYPE "GroupPlannedTurnStatus" AS ENUM ('queued', 'claimed', 'speaking', 'completed', 'interrupted', 'failed', 'skipped');
CREATE TYPE "GroupProviderEventType" AS ENUM ('agent_response', 'agent_response_correction', 'speak_started', 'speak_ended', 'interruption');

ALTER TABLE "GroupVoiceSession"
  ADD COLUMN "orchestrationPhase" "GroupOrchestrationPhase" NOT NULL DEFAULT 'listening',
  ADD COLUMN "floorOwnerAvatarId" TEXT,
  ADD COLUMN "floorTurnId" TEXT,
  ADD COLUMN "floorLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "rollingSummary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "contextVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "GroupVoiceRound" (
  "id" TEXT NOT NULL,
  "groupVoiceSessionId" TEXT NOT NULL,
  "userMessageId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "status" "GroupVoiceRoundStatus" NOT NULL DEFAULT 'deliberating',
  "intent" TEXT NOT NULL,
  "contributions" JSONB,
  "contextVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GroupVoiceRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupPlannedTurn" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "GroupPlannedTurnStatus" NOT NULL DEFAULT 'queued',
  "responseText" TEXT NOT NULL,
  "providerText" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupPlannedTurn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupVoiceProviderEvent" (
  "id" TEXT NOT NULL,
  "groupVoiceSessionId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "turnId" TEXT,
  "type" "GroupProviderEventType" NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupVoiceProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupVoiceSession_orchestrationPhase_floorLeaseExpiresAt_idx" ON "GroupVoiceSession"("orchestrationPhase", "floorLeaseExpiresAt");
CREATE UNIQUE INDEX "GroupVoiceRound_userMessageId_key" ON "GroupVoiceRound"("userMessageId");
CREATE UNIQUE INDEX "GroupVoiceRound_groupVoiceSessionId_sourceEventId_key" ON "GroupVoiceRound"("groupVoiceSessionId", "sourceEventId");
CREATE INDEX "GroupVoiceRound_groupVoiceSessionId_createdAt_idx" ON "GroupVoiceRound"("groupVoiceSessionId", "createdAt");
CREATE INDEX "GroupVoiceRound_status_idx" ON "GroupVoiceRound"("status");
CREATE UNIQUE INDEX "GroupPlannedTurn_roundId_position_key" ON "GroupPlannedTurn"("roundId", "position");
CREATE UNIQUE INDEX "GroupPlannedTurn_roundId_avatarAgentId_key" ON "GroupPlannedTurn"("roundId", "avatarAgentId");
CREATE INDEX "GroupPlannedTurn_avatarAgentId_idx" ON "GroupPlannedTurn"("avatarAgentId");
CREATE INDEX "GroupPlannedTurn_status_createdAt_idx" ON "GroupPlannedTurn"("status", "createdAt");
CREATE UNIQUE INDEX "GroupVoiceProviderEvent_groupVoiceSessionId_sourceEventId_key" ON "GroupVoiceProviderEvent"("groupVoiceSessionId", "sourceEventId");
CREATE INDEX "GroupVoiceProviderEvent_groupVoiceSessionId_createdAt_idx" ON "GroupVoiceProviderEvent"("groupVoiceSessionId", "createdAt");
CREATE INDEX "GroupVoiceProviderEvent_turnId_idx" ON "GroupVoiceProviderEvent"("turnId");

ALTER TABLE "GroupVoiceRound" ADD CONSTRAINT "GroupVoiceRound_groupVoiceSessionId_fkey" FOREIGN KEY ("groupVoiceSessionId") REFERENCES "GroupVoiceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceRound" ADD CONSTRAINT "GroupVoiceRound_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupPlannedTurn" ADD CONSTRAINT "GroupPlannedTurn_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "GroupVoiceRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupPlannedTurn" ADD CONSTRAINT "GroupPlannedTurn_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceProviderEvent" ADD CONSTRAINT "GroupVoiceProviderEvent_groupVoiceSessionId_fkey" FOREIGN KEY ("groupVoiceSessionId") REFERENCES "GroupVoiceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
