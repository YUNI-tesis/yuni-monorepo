-- Group sharing is intentionally modeled separately from single-avatar sharing.
-- This keeps group-only grants from accidentally authorizing individual avatars.
ALTER TYPE "JobType" ADD VALUE 'group_agent_provider_sync';

ALTER TABLE "AvatarGroup"
  ADD COLUMN "membershipVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "AvatarAgent"
  ADD COLUMN "groupProviderSyncRevision" TEXT;

ALTER TABLE "Conversation"
  ADD COLUMN "groupAccessGrantId" TEXT,
  ADD COLUMN "groupPublicSessionId" TEXT,
  ADD COLUMN "groupShareLinkId" TEXT,
  ADD COLUMN "avatarGroupOwnerIdSnapshot" TEXT,
  ADD COLUMN "avatarGroupNameSnapshot" TEXT,
  ADD COLUMN "groupMembershipVersion" INTEGER,
  ADD COLUMN "avatarGroupRosterSnapshot" JSONB;

ALTER TABLE "Conversation"
  DROP CONSTRAINT "Conversation_avatarAgentId_fkey",
  ALTER COLUMN "avatarAgentId" DROP NOT NULL,
  ADD CONSTRAINT "Conversation_avatarAgentId_fkey"
    FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD COLUMN "groupParticipantSnapshotId" TEXT;

ALTER TABLE "GroupVoiceSession"
  ALTER COLUMN "avatarGroupId" DROP NOT NULL,
  ADD COLUMN "initiatorUserId" TEXT,
  ADD COLUMN "groupAccessGrantId" TEXT,
  ADD COLUMN "groupPublicSessionId" TEXT,
  ADD COLUMN "activatedAt" TIMESTAMP(3);

-- Existing group calls were all authenticated owner calls.
UPDATE "GroupVoiceSession"
SET "initiatorUserId" = "ownerId"
WHERE "initiatorUserId" IS NULL;

UPDATE "GroupVoiceSession" AS group_session
SET "activatedAt" = activation."activatedAt"
FROM (
  SELECT participant."groupVoiceSessionId", MAX(realtime."activatedAt") AS "activatedAt"
  FROM "GroupVoiceParticipant" AS participant
  LEFT JOIN "RealtimeSession" AS realtime ON realtime."id" = participant."realtimeSessionId"
  GROUP BY participant."groupVoiceSessionId"
  HAVING COUNT(*) > 0 AND COUNT(*) = COUNT(realtime."activatedAt")
) AS activation
WHERE group_session."id" = activation."groupVoiceSessionId";

-- Legacy group conversations are backfilled only when their explicit group
-- relation and ConversationAvatar roster make the provenance deterministic.
UPDATE "Conversation" AS conversation
SET
  "avatarGroupOwnerIdSnapshot" = avatar_group."ownerId",
  "avatarGroupNameSnapshot" = avatar_group."name",
  "groupMembershipVersion" = avatar_group."membershipVersion",
  "avatarGroupRosterSnapshot" = roster."members"
FROM "AvatarGroup" AS avatar_group,
(
  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'id', avatar."id",
      'name', avatar."name",
      'description', avatar."description",
      'thumbnailUrl', avatar."liveAvatarConfig" ->> 'thumbnailUrl',
      'position', conversation_avatar."position"
    ) ORDER BY conversation_avatar."position"
  ) AS "members",
  conversation_avatar."conversationId"
  FROM "ConversationAvatar" AS conversation_avatar
  INNER JOIN "AvatarAgent" AS avatar ON avatar."id" = conversation_avatar."avatarAgentId"
  GROUP BY conversation_avatar."conversationId"
) AS roster
WHERE conversation."avatarGroupId" = avatar_group."id"
  AND roster."conversationId" = conversation."id"
  AND roster."members" IS NOT NULL;

CREATE TABLE "GroupShareLink" (
  "id" TEXT NOT NULL,
  "avatarGroupId" TEXT,
  "ownerId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "avatarGroupOwnerIdSnapshot" TEXT NOT NULL,
  "avatarGroupNameSnapshot" TEXT NOT NULL,
  "groupMembershipVersion" INTEGER NOT NULL,
  "maxSessionDurationSeconds" INTEGER,
  "maxSessionsPer24Hours" INTEGER,
  CONSTRAINT "GroupShareLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupAccessGrant" (
  "id" TEXT NOT NULL,
  "avatarGroupId" TEXT,
  "ownerId" TEXT NOT NULL,
  "participantEmail" TEXT NOT NULL,
  "participantUserId" TEXT,
  "status" "AccessGrantStatus" NOT NULL DEFAULT 'active',
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "maxSessionDurationSeconds" INTEGER,
  "maxSessionsPer24Hours" INTEGER,
  "avatarGroupOwnerIdSnapshot" TEXT NOT NULL,
  "avatarGroupNameSnapshot" TEXT NOT NULL,
  "groupMembershipVersion" INTEGER NOT NULL,
  CONSTRAINT "GroupAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupPublicSession" (
  "id" TEXT NOT NULL,
  "groupShareLinkId" TEXT,
  "avatarGroupId" TEXT,
  "anonymousId" TEXT,
  "participantEmail" TEXT NOT NULL,
  "participantUserId" TEXT,
  "consentScopeId" TEXT NOT NULL,
  "consentVersion" INTEGER NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "PublicSessionStatus" NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "avatarGroupOwnerIdSnapshot" TEXT NOT NULL,
  "avatarGroupNameSnapshot" TEXT NOT NULL,
  "groupMembershipVersion" INTEGER NOT NULL,
  CONSTRAINT "GroupPublicSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupAccessConsent" (
  "id" TEXT NOT NULL,
  "groupAccessGrantId" TEXT NOT NULL,
  "participantUserId" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "membershipVersion" INTEGER NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupAccessConsent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupAccessConsent_groupAccessGrantId_participantUserId_mem_key"
  ON "GroupAccessConsent"("groupAccessGrantId", "participantUserId", "membershipVersion");
CREATE INDEX "GroupAccessConsent_participantUserId_consentedAt_idx"
  ON "GroupAccessConsent"("participantUserId", "consentedAt");

CREATE TABLE "GroupConversationParticipantSnapshot" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "sourceAvatarId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupConversationParticipantSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupConversationParticipantSnapshot_conversationId_sourceA_key"
  ON "GroupConversationParticipantSnapshot"("conversationId", "sourceAvatarId");
CREATE UNIQUE INDEX "GroupConversationParticipantSnapshot_conversationId_positio_key"
  ON "GroupConversationParticipantSnapshot"("conversationId", "position");
CREATE INDEX "GroupConversationParticipantSnapshot_sourceAvatarId_idx"
  ON "GroupConversationParticipantSnapshot"("sourceAvatarId");
CREATE INDEX "Message_groupParticipantSnapshotId_idx" ON "Message"("groupParticipantSnapshotId");

INSERT INTO "GroupConversationParticipantSnapshot" (
  "id",
  "conversationId",
  "sourceAvatarId",
  "name",
  "description",
  "thumbnailUrl",
  "position"
)
SELECT
  'legacy_group_snapshot_' || MD5(conversation_avatar."conversationId" || ':' || conversation_avatar."avatarAgentId"),
  conversation_avatar."conversationId",
  avatar."id",
  avatar."name",
  avatar."description",
  avatar."liveAvatarConfig" ->> 'thumbnailUrl',
  conversation_avatar."position"
FROM "ConversationAvatar" AS conversation_avatar
INNER JOIN "Conversation" AS conversation ON conversation."id" = conversation_avatar."conversationId"
INNER JOIN "AvatarAgent" AS avatar ON avatar."id" = conversation_avatar."avatarAgentId"
WHERE conversation."avatarGroupId" IS NOT NULL
ON CONFLICT ("conversationId", "sourceAvatarId") DO NOTHING;

UPDATE "Message" AS message
SET "groupParticipantSnapshotId" = participant_snapshot."id"
FROM "GroupConversationParticipantSnapshot" AS participant_snapshot
WHERE participant_snapshot."conversationId" = message."conversationId"
  AND participant_snapshot."sourceAvatarId" = message."speakerAvatarId"
  AND message."groupParticipantSnapshotId" IS NULL;

ALTER TABLE "GroupShareLink"
  ADD CONSTRAINT "GroupShareLink_duration_limit_check"
    CHECK ("maxSessionDurationSeconds" IS NULL OR "maxSessionDurationSeconds" BETWEEN 10 AND 3600),
  ADD CONSTRAINT "GroupShareLink_count_limit_check"
    CHECK ("maxSessionsPer24Hours" IS NULL OR "maxSessionsPer24Hours" BETWEEN 1 AND 100);

ALTER TABLE "GroupAccessGrant"
  ADD CONSTRAINT "GroupAccessGrant_duration_limit_check"
    CHECK ("maxSessionDurationSeconds" IS NULL OR "maxSessionDurationSeconds" BETWEEN 10 AND 3600),
  ADD CONSTRAINT "GroupAccessGrant_count_limit_check"
    CHECK ("maxSessionsPer24Hours" IS NULL OR "maxSessionsPer24Hours" BETWEEN 1 AND 100);

CREATE UNIQUE INDEX "GroupShareLink_slug_active_key"
  ON "GroupShareLink"("slug") WHERE "deletedAt" IS NULL;
CREATE INDEX "GroupShareLink_avatarGroupId_idx" ON "GroupShareLink"("avatarGroupId");
CREATE INDEX "GroupShareLink_slug_idx" ON "GroupShareLink"("slug");
CREATE INDEX "GroupShareLink_ownerId_avatarGroupId_deletedAt_idx"
  ON "GroupShareLink"("ownerId", "avatarGroupId", "deletedAt");
CREATE INDEX "GroupShareLink_isEnabled_deletedAt_idx"
  ON "GroupShareLink"("isEnabled", "deletedAt");

CREATE UNIQUE INDEX "GroupAccessGrant_avatarGroupId_participantEmail_key"
  ON "GroupAccessGrant"("avatarGroupId", "participantEmail");
CREATE INDEX "GroupAccessGrant_ownerId_avatarGroupId_idx"
  ON "GroupAccessGrant"("ownerId", "avatarGroupId");
CREATE INDEX "GroupAccessGrant_ownerId_status_createdAt_idx"
  ON "GroupAccessGrant"("ownerId", "status", "createdAt");
CREATE INDEX "GroupAccessGrant_ownerId_status_lastUsedAt_idx"
  ON "GroupAccessGrant"("ownerId", "status", "lastUsedAt");
CREATE INDEX "GroupAccessGrant_participantUserId_status_idx"
  ON "GroupAccessGrant"("participantUserId", "status");
CREATE INDEX "GroupAccessGrant_participantEmail_status_idx"
  ON "GroupAccessGrant"("participantEmail", "status");

CREATE INDEX "GroupPublicSession_groupShareLinkId_idx"
  ON "GroupPublicSession"("groupShareLinkId");
CREATE INDEX "GroupPublicSession_groupShareLinkId_participantEmail_starte_idx"
  ON "GroupPublicSession"("groupShareLinkId", "participantEmail", "startedAt");
CREATE INDEX "GroupPublicSession_avatarGroupId_idx" ON "GroupPublicSession"("avatarGroupId");
CREATE INDEX "GroupPublicSession_participantUserId_idx" ON "GroupPublicSession"("participantUserId");
CREATE INDEX "GroupPublicSession_status_expiresAt_idx"
  ON "GroupPublicSession"("status", "expiresAt");

CREATE UNIQUE INDEX "Conversation_groupPublicSessionId_key"
  ON "Conversation"("groupPublicSessionId");
CREATE INDEX "Conversation_groupAccessGrantId_idx" ON "Conversation"("groupAccessGrantId");
CREATE INDEX "Conversation_groupAccessGrantId_lastMessageAt_idx"
  ON "Conversation"("groupAccessGrantId", "lastMessageAt");
CREATE INDEX "Conversation_groupPublicSessionId_idx" ON "Conversation"("groupPublicSessionId");
CREATE INDEX "Conversation_groupShareLinkId_idx" ON "Conversation"("groupShareLinkId");
CREATE INDEX "Conversation_groupShareLinkId_lastMessageAt_idx"
  ON "Conversation"("groupShareLinkId", "lastMessageAt");
CREATE INDEX "Conversation_avatarGroupId_participantEmail_lastMessageAt_idx"
  ON "Conversation"("avatarGroupId", "participantEmail", "lastMessageAt");
CREATE INDEX "Conversation_group_participant_email_normalized_idx"
  ON "Conversation"("avatarGroupId", LOWER(BTRIM("participantEmail")), "lastMessageAt")
  WHERE "avatarGroupId" IS NOT NULL AND "participantEmail" IS NOT NULL;

CREATE UNIQUE INDEX "GroupVoiceSession_groupPublicSessionId_key"
  ON "GroupVoiceSession"("groupPublicSessionId");
CREATE INDEX "GroupVoiceSession_initiatorUserId_status_idx"
  ON "GroupVoiceSession"("initiatorUserId", "status");
CREATE INDEX "GroupVoiceSession_groupAccessGrantId_idx"
  ON "GroupVoiceSession"("groupAccessGrantId");
CREATE INDEX "GroupVoiceSession_avatarGroupId_activatedAt_idx"
  ON "GroupVoiceSession"("avatarGroupId", "activatedAt");
CREATE INDEX "GroupVoiceSession_avatarGroupId_endedAt_idx"
  ON "GroupVoiceSession"("avatarGroupId", "endedAt");
CREATE INDEX "GroupVoiceSession_groupAccessGrantId_activatedAt_idx"
  ON "GroupVoiceSession"("groupAccessGrantId", "activatedAt");

DROP INDEX "AvatarGroup_ownerId_updatedAt_idx";
CREATE INDEX "AvatarGroup_ownerId_deletedAt_updatedAt_idx"
  ON "AvatarGroup"("ownerId", "deletedAt", "updatedAt");

ALTER TABLE "GroupShareLink"
  ADD CONSTRAINT "GroupShareLink_avatarGroupId_fkey"
  FOREIGN KEY ("avatarGroupId") REFERENCES "AvatarGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupShareLink_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupAccessGrant"
  ADD CONSTRAINT "GroupAccessGrant_avatarGroupId_fkey"
  FOREIGN KEY ("avatarGroupId") REFERENCES "AvatarGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupAccessGrant_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupAccessGrant_participantUserId_fkey"
  FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GroupAccessConsent"
  ADD CONSTRAINT "GroupAccessConsent_groupAccessGrantId_fkey"
  FOREIGN KEY ("groupAccessGrantId") REFERENCES "GroupAccessGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupAccessConsent_participantUserId_fkey"
  FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupPublicSession"
  ADD CONSTRAINT "GroupPublicSession_groupShareLinkId_fkey"
  FOREIGN KEY ("groupShareLinkId") REFERENCES "GroupShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupPublicSession_avatarGroupId_fkey"
  FOREIGN KEY ("avatarGroupId") REFERENCES "AvatarGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupPublicSession_participantUserId_fkey"
  FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_groupAccessGrantId_fkey"
  FOREIGN KEY ("groupAccessGrantId") REFERENCES "GroupAccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversation_groupPublicSessionId_fkey"
  FOREIGN KEY ("groupPublicSessionId") REFERENCES "GroupPublicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Conversation_groupShareLinkId_fkey"
  FOREIGN KEY ("groupShareLinkId") REFERENCES "GroupShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GroupConversationParticipantSnapshot"
  ADD CONSTRAINT "GroupConversationParticipantSnapshot_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_groupParticipantSnapshotId_fkey"
  FOREIGN KEY ("groupParticipantSnapshotId") REFERENCES "GroupConversationParticipantSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GroupVoiceSession"
  DROP CONSTRAINT "GroupVoiceSession_avatarGroupId_fkey",
  ADD CONSTRAINT "GroupVoiceSession_avatarGroupId_fkey"
  FOREIGN KEY ("avatarGroupId") REFERENCES "AvatarGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupVoiceSession_initiatorUserId_fkey"
  FOREIGN KEY ("initiatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupVoiceSession_groupAccessGrantId_fkey"
  FOREIGN KEY ("groupAccessGrantId") REFERENCES "GroupAccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupVoiceSession_groupPublicSessionId_fkey"
  FOREIGN KEY ("groupPublicSessionId") REFERENCES "GroupPublicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "GroupVoiceSession_principal_check"
  CHECK (("initiatorUserId" IS NOT NULL AND "groupPublicSessionId" IS NULL)
      OR ("initiatorUserId" IS NULL AND "groupPublicSessionId" IS NOT NULL)),
  ADD CONSTRAINT "GroupVoiceSession_channel_check"
  CHECK (NOT ("groupAccessGrantId" IS NOT NULL AND "groupPublicSessionId" IS NOT NULL));
