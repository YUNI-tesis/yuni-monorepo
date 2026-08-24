ALTER TABLE "ShareLink"
ADD COLUMN "maxSessionDurationSeconds" INTEGER,
ADD COLUMN "maxSessionsPer24Hours" INTEGER;

ALTER TABLE "AccessGrant"
ADD COLUMN "maxSessionDurationSeconds" INTEGER,
ADD COLUMN "maxSessionsPer24Hours" INTEGER;

ALTER TABLE "RealtimeSession"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "accessGrantId" TEXT;

UPDATE "RealtimeSession" AS realtime_session
SET "accessGrantId" = conversation."accessGrantId"
FROM "Conversation" AS conversation
WHERE realtime_session."conversationId" = conversation."id"
  AND conversation."accessGrantId" IS NOT NULL;

-- Existing shared sessions predate configurable expiry. Apply the platform ceiling so
-- stale connecting/active rows cannot consume participant or avatar capacity forever.
UPDATE "RealtimeSession"
SET "expiresAt" = "startedAt" + INTERVAL '60 minutes'
WHERE "accessGrantId" IS NOT NULL
  AND "expiresAt" IS NULL;

ALTER TABLE "RealtimeSession"
ADD CONSTRAINT "RealtimeSession_accessGrantId_fkey"
FOREIGN KEY ("accessGrantId") REFERENCES "AccessGrant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShareLink"
ADD CONSTRAINT "ShareLink_session_duration_seconds_limit_check"
CHECK ("maxSessionDurationSeconds" IS NULL OR "maxSessionDurationSeconds" BETWEEN 10 AND 3600),
ADD CONSTRAINT "ShareLink_session_count_limit_check"
CHECK ("maxSessionsPer24Hours" IS NULL OR "maxSessionsPer24Hours" BETWEEN 1 AND 100);

ALTER TABLE "AccessGrant"
ADD CONSTRAINT "AccessGrant_session_duration_seconds_limit_check"
CHECK ("maxSessionDurationSeconds" IS NULL OR "maxSessionDurationSeconds" BETWEEN 10 AND 3600),
ADD CONSTRAINT "AccessGrant_session_count_limit_check"
CHECK ("maxSessionsPer24Hours" IS NULL OR "maxSessionsPer24Hours" BETWEEN 1 AND 100);

DROP INDEX "PublicSession_shareLinkId_participantEmail_idx";

CREATE INDEX "PublicSession_shareLinkId_participantEmail_startedAt_idx"
ON "PublicSession"("shareLinkId", "participantEmail", "startedAt");

CREATE INDEX "RealtimeSession_accessGrantId_status_startedAt_idx"
ON "RealtimeSession"("accessGrantId", "status", "startedAt");

CREATE INDEX "RealtimeSession_avatarAgentId_status_startedAt_idx"
ON "RealtimeSession"("avatarAgentId", "status", "startedAt");
