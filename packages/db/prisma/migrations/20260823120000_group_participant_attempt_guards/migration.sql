-- Keep participant failure callbacks bound to the exact LiveAvatar connection
-- attempt that emitted them. Historical receipts remain nullable.
ALTER TABLE "GroupVoiceParticipantFailureEvent"
  ADD COLUMN "participantAttemptId" TEXT;

CREATE INDEX "GroupVoiceParticipantFailureEvent_attempt_idx"
  ON "GroupVoiceParticipantFailureEvent"("participantAttemptId");
