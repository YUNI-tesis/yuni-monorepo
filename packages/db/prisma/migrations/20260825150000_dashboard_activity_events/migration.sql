-- Persist the exact moment a realtime voice session becomes usable. Historical
-- sessions can only be approximated from the data that existed before this
-- column, so successful/active sessions use their creation timestamp and
-- errored sessions are backfilled only when participant speech was persisted.
ALTER TABLE "RealtimeSession" ADD COLUMN "activatedAt" TIMESTAMP(3);

UPDATE "RealtimeSession" AS realtime
SET "activatedAt" = realtime."startedAt"
WHERE realtime."status" IN ('active'::"RealtimeSessionStatus", 'ended'::"RealtimeSessionStatus");

UPDATE "RealtimeSession" AS realtime
SET "activatedAt" = realtime."startedAt"
WHERE realtime."status" = 'errored'::"RealtimeSessionStatus"
  AND realtime."conversationId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "Message" AS message
    WHERE message."conversationId" = realtime."conversationId"
      AND message."role" = 'user'::"MessageRole"
  );

CREATE INDEX "AccessGrant_ownerId_status_createdAt_idx"
  ON "AccessGrant"("ownerId", "status", "createdAt");
CREATE INDEX "Conversation_avatarAgentId_participantEmail_lastMessageAt_idx"
  ON "Conversation"("avatarAgentId", "participantEmail", "lastMessageAt");
-- Prisma cannot represent expression indexes in schema.prisma. Dashboard joins
-- use this exact normalized identity expression.
CREATE INDEX "Conversation_avatarAgentId_normalizedParticipantEmail_idx"
  ON "Conversation"("avatarAgentId", LOWER(BTRIM("participantEmail")));
CREATE INDEX "Message_role_createdAt_idx" ON "Message"("role", "createdAt");
CREATE INDEX "RealtimeSession_avatarAgentId_activatedAt_idx"
  ON "RealtimeSession"("avatarAgentId", "activatedAt");
CREATE INDEX "RealtimeSession_avatarAgentId_endedAt_idx"
  ON "RealtimeSession"("avatarAgentId", "endedAt");
DROP INDEX "RealtimeSession_conversationId_idx";
CREATE INDEX "RealtimeSession_conversationId_startedAt_idx"
  ON "RealtimeSession"("conversationId", "startedAt");
