-- Keep the legacy experimental GroupVoiceInterruptionEvent table, when present,
-- untouched. The v2 receipt has different semantics and its own physical table.
CREATE TABLE "GroupVoiceHumanInterruptionReceipt" (
  "id" TEXT NOT NULL,
  "groupVoiceSessionId" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "roundId" TEXT,
  "turnId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "affectedParticipants" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupVoiceHumanInterruptionReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupVoiceHumanInterruptionReceipt_session_source_key" ON "GroupVoiceHumanInterruptionReceipt"("groupVoiceSessionId", "sourceEventId");
CREATE INDEX "GroupVoiceHumanInterruptionReceipt_session_created_idx" ON "GroupVoiceHumanInterruptionReceipt"("groupVoiceSessionId", "createdAt");
ALTER TABLE "GroupVoiceHumanInterruptionReceipt" ADD CONSTRAINT "GroupVoiceHumanInterruptionReceipt_groupVoiceSessionId_fkey" FOREIGN KEY ("groupVoiceSessionId") REFERENCES "GroupVoiceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GroupVoiceInterruptedTurn" (
  "id" TEXT NOT NULL,
  "interruptionEventId" TEXT NOT NULL,
  "turnId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "generatedText" TEXT,
  "reportedFragment" TEXT,
  "fragmentSource" TEXT,
  "heardCertainty" TEXT NOT NULL DEFAULT 'unknown',
  "messageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupVoiceInterruptedTurn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupVoiceInterruptedTurn_turnId_key" ON "GroupVoiceInterruptedTurn"("turnId");
ALTER TABLE "GroupVoiceInterruptedTurn" ADD CONSTRAINT "GroupVoiceInterruptedTurn_interruptionEventId_fkey" FOREIGN KEY ("interruptionEventId") REFERENCES "GroupVoiceHumanInterruptionReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
