-- Durable idempotency receipts for browser-reported group participant failures.
CREATE TABLE "GroupVoiceParticipantFailureEvent" (
  "id" TEXT NOT NULL,
  "groupVoiceSessionId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "expectedTurnId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GroupVoiceParticipantFailureEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupVoiceParticipantFailureEvent_groupVoiceSessionId_sourceEventId_key"
  ON "GroupVoiceParticipantFailureEvent"("groupVoiceSessionId", "sourceEventId");

CREATE INDEX "GroupVoiceParticipantFailureEvent_groupVoiceSessionId_createdAt_idx"
  ON "GroupVoiceParticipantFailureEvent"("groupVoiceSessionId", "createdAt");

CREATE INDEX "GroupVoiceParticipantFailureEvent_avatarAgentId_idx"
  ON "GroupVoiceParticipantFailureEvent"("avatarAgentId");

ALTER TABLE "GroupVoiceParticipantFailureEvent"
  ADD CONSTRAINT "GroupVoiceParticipantFailureEvent_groupVoiceSessionId_fkey"
  FOREIGN KEY ("groupVoiceSessionId") REFERENCES "GroupVoiceSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
