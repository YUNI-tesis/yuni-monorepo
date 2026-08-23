-- Multi-avatar groups, participant sessions, and attributed conversation turns.
CREATE TYPE "GroupVoiceSessionStatus" AS ENUM ('connecting', 'active', 'ended', 'errored');
CREATE TYPE "GroupVoiceParticipantStatus" AS ENUM ('connecting', 'active', 'ended', 'errored');

ALTER TABLE "AvatarAgent"
  ADD COLUMN "groupProviderAgentId" TEXT,
  ADD COLUMN "groupProviderSyncFingerprint" TEXT,
  ADD COLUMN "groupProviderSyncStatus" "ProviderSyncStatus" NOT NULL DEFAULT 'not_synced',
  ADD COLUMN "groupProviderSyncError" TEXT,
  ADD COLUMN "groupProviderSyncedAt" TIMESTAMP(3);

ALTER TABLE "Conversation" ADD COLUMN "avatarGroupId" TEXT;

ALTER TABLE "Message"
  ADD COLUMN "speakerAvatarId" TEXT,
  ADD COLUMN "sourceEventId" TEXT;

CREATE TABLE "AvatarGroup" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvatarGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvatarGroupMember" (
  "id" TEXT NOT NULL,
  "avatarGroupId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "accessGrantId" TEXT,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvatarGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationAvatar" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "accessGrantId" TEXT,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationAvatar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupVoiceSession" (
  "id" TEXT NOT NULL,
  "avatarGroupId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" "GroupVoiceSessionStatus" NOT NULL DEFAULT 'connecting',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  CONSTRAINT "GroupVoiceSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupVoiceParticipant" (
  "id" TEXT NOT NULL,
  "groupVoiceSessionId" TEXT NOT NULL,
  "avatarAgentId" TEXT NOT NULL,
  "realtimeSessionId" TEXT,
  "status" "GroupVoiceParticipantStatus" NOT NULL DEFAULT 'connecting',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "GroupVoiceParticipant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AvatarGroup_ownerId_updatedAt_idx" ON "AvatarGroup"("ownerId", "updatedAt");
CREATE UNIQUE INDEX "AvatarGroupMember_avatarGroupId_avatarAgentId_key" ON "AvatarGroupMember"("avatarGroupId", "avatarAgentId");
CREATE UNIQUE INDEX "AvatarGroupMember_avatarGroupId_position_key" ON "AvatarGroupMember"("avatarGroupId", "position");
CREATE INDEX "AvatarGroupMember_avatarAgentId_idx" ON "AvatarGroupMember"("avatarAgentId");
CREATE INDEX "AvatarGroupMember_accessGrantId_idx" ON "AvatarGroupMember"("accessGrantId");
CREATE UNIQUE INDEX "ConversationAvatar_conversationId_avatarAgentId_key" ON "ConversationAvatar"("conversationId", "avatarAgentId");
CREATE UNIQUE INDEX "ConversationAvatar_conversationId_position_key" ON "ConversationAvatar"("conversationId", "position");
CREATE INDEX "ConversationAvatar_avatarAgentId_idx" ON "ConversationAvatar"("avatarAgentId");
CREATE INDEX "ConversationAvatar_accessGrantId_idx" ON "ConversationAvatar"("accessGrantId");
CREATE UNIQUE INDEX "GroupVoiceSession_conversationId_key" ON "GroupVoiceSession"("conversationId");
CREATE INDEX "GroupVoiceSession_avatarGroupId_idx" ON "GroupVoiceSession"("avatarGroupId");
CREATE INDEX "GroupVoiceSession_ownerId_status_idx" ON "GroupVoiceSession"("ownerId", "status");
CREATE INDEX "GroupVoiceSession_status_expiresAt_idx" ON "GroupVoiceSession"("status", "expiresAt");
CREATE UNIQUE INDEX "GroupVoiceParticipant_realtimeSessionId_key" ON "GroupVoiceParticipant"("realtimeSessionId");
CREATE UNIQUE INDEX "GroupVoiceParticipant_groupVoiceSessionId_avatarAgentId_key" ON "GroupVoiceParticipant"("groupVoiceSessionId", "avatarAgentId");
CREATE INDEX "GroupVoiceParticipant_avatarAgentId_idx" ON "GroupVoiceParticipant"("avatarAgentId");
CREATE INDEX "GroupVoiceParticipant_status_idx" ON "GroupVoiceParticipant"("status");
CREATE INDEX "Conversation_avatarGroupId_idx" ON "Conversation"("avatarGroupId");
CREATE INDEX "Message_speakerAvatarId_idx" ON "Message"("speakerAvatarId");
CREATE UNIQUE INDEX "Message_conversationId_sourceEventId_key" ON "Message"("conversationId", "sourceEventId");

ALTER TABLE "AvatarGroup" ADD CONSTRAINT "AvatarGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarGroupMember" ADD CONSTRAINT "AvatarGroupMember_avatarGroupId_fkey" FOREIGN KEY ("avatarGroupId") REFERENCES "AvatarGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarGroupMember" ADD CONSTRAINT "AvatarGroupMember_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvatarGroupMember" ADD CONSTRAINT "AvatarGroupMember_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES "AccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_avatarGroupId_fkey" FOREIGN KEY ("avatarGroupId") REFERENCES "AvatarGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationAvatar" ADD CONSTRAINT "ConversationAvatar_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAvatar" ADD CONSTRAINT "ConversationAvatar_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationAvatar" ADD CONSTRAINT "ConversationAvatar_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES "AccessGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceSession" ADD CONSTRAINT "GroupVoiceSession_avatarGroupId_fkey" FOREIGN KEY ("avatarGroupId") REFERENCES "AvatarGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceSession" ADD CONSTRAINT "GroupVoiceSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceSession" ADD CONSTRAINT "GroupVoiceSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceParticipant" ADD CONSTRAINT "GroupVoiceParticipant_groupVoiceSessionId_fkey" FOREIGN KEY ("groupVoiceSessionId") REFERENCES "GroupVoiceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceParticipant" ADD CONSTRAINT "GroupVoiceParticipant_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupVoiceParticipant" ADD CONSTRAINT "GroupVoiceParticipant_realtimeSessionId_fkey" FOREIGN KEY ("realtimeSessionId") REFERENCES "RealtimeSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_speakerAvatarId_fkey" FOREIGN KEY ("speakerAvatarId") REFERENCES "AvatarAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
