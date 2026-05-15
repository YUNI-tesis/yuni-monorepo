-- CreateEnum
CREATE TYPE "AvatarStatus" AS ENUM ('draft', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "ConversationVisibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('text', 'voice');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "PublicSessionStatus" AS ENUM ('active', 'ended', 'blocked', 'errored');

-- CreateEnum
CREATE TYPE "RealtimeSessionStatus" AS ENUM ('connecting', 'active', 'ended', 'errored');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'ingesting', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "UsageOperation" AS ENUM ('chat_completion', 'embedding', 'stt', 'tts', 'live_avatar');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('document_ingest', 'session_cleanup');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarAgent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "voiceConfig" JSONB NOT NULL,
    "liveAvatarConfig" JSONB NOT NULL,
    "status" "AvatarStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvatarAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "avatarAgentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "avatarAgentId" TEXT NOT NULL,
    "publicSessionId" TEXT,
    "shareLinkId" TEXT,
    "visibility" "ConversationVisibility" NOT NULL,
    "mode" "ConversationMode" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicSession" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "avatarAgentId" TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "status" "PublicSessionStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "PublicSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealtimeSession" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "publicSessionId" TEXT,
    "avatarAgentId" TEXT NOT NULL,
    "status" "RealtimeSessionStatus" NOT NULL DEFAULT 'connecting',
    "providerSessionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    CONSTRAINT "RealtimeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "avatarAgentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "avatarAgentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB,
    "chunkIndex" INTEGER NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "avatarAgentId" TEXT NOT NULL,
    "conversationId" TEXT,
    "publicSessionId" TEXT,
    "shareLinkId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "operation" "UsageOperation" NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "audioSeconds" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "avatarAgentId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "runAfter" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "AvatarAgent_ownerId_idx" ON "AvatarAgent"("ownerId");
CREATE INDEX "AvatarAgent_ownerId_status_idx" ON "AvatarAgent"("ownerId", "status");
CREATE INDEX "AvatarAgent_updatedAt_idx" ON "AvatarAgent"("updatedAt");
CREATE UNIQUE INDEX "ShareLink_slug_key" ON "ShareLink"("slug");
CREATE INDEX "ShareLink_avatarAgentId_idx" ON "ShareLink"("avatarAgentId");
CREATE INDEX "ShareLink_ownerId_idx" ON "ShareLink"("ownerId");
CREATE INDEX "ShareLink_ownerId_avatarAgentId_idx" ON "ShareLink"("ownerId", "avatarAgentId");
CREATE INDEX "ShareLink_slug_idx" ON "ShareLink"("slug");
CREATE INDEX "ShareLink_isEnabled_idx" ON "ShareLink"("isEnabled");
CREATE UNIQUE INDEX "Conversation_publicSessionId_key" ON "Conversation"("publicSessionId");
CREATE INDEX "Conversation_ownerId_avatarAgentId_lastMessageAt_idx" ON "Conversation"("ownerId", "avatarAgentId", "lastMessageAt");
CREATE INDEX "Conversation_avatarAgentId_idx" ON "Conversation"("avatarAgentId");
CREATE INDEX "Conversation_publicSessionId_idx" ON "Conversation"("publicSessionId");
CREATE INDEX "Conversation_shareLinkId_idx" ON "Conversation"("shareLinkId");
CREATE INDEX "Conversation_visibility_idx" ON "Conversation"("visibility");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "PublicSession_shareLinkId_idx" ON "PublicSession"("shareLinkId");
CREATE INDEX "PublicSession_avatarAgentId_idx" ON "PublicSession"("avatarAgentId");
CREATE INDEX "PublicSession_anonymousId_idx" ON "PublicSession"("anonymousId");
CREATE INDEX "PublicSession_status_idx" ON "PublicSession"("status");
CREATE INDEX "RealtimeSession_conversationId_idx" ON "RealtimeSession"("conversationId");
CREATE INDEX "RealtimeSession_publicSessionId_idx" ON "RealtimeSession"("publicSessionId");
CREATE INDEX "RealtimeSession_avatarAgentId_idx" ON "RealtimeSession"("avatarAgentId");
CREATE INDEX "RealtimeSession_status_idx" ON "RealtimeSession"("status");
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");
CREATE INDEX "Document_avatarAgentId_idx" ON "Document"("avatarAgentId");
CREATE INDEX "Document_status_idx" ON "Document"("status");
CREATE INDEX "Document_storageKey_idx" ON "Document"("storageKey");
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");
CREATE INDEX "DocumentChunk_avatarAgentId_idx" ON "DocumentChunk"("avatarAgentId");
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key" ON "DocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "UsageEvent_ownerId_idx" ON "UsageEvent"("ownerId");
CREATE INDEX "UsageEvent_avatarAgentId_idx" ON "UsageEvent"("avatarAgentId");
CREATE INDEX "UsageEvent_shareLinkId_idx" ON "UsageEvent"("shareLinkId");
CREATE INDEX "UsageEvent_publicSessionId_idx" ON "UsageEvent"("publicSessionId");
CREATE INDEX "UsageEvent_conversationId_idx" ON "UsageEvent"("conversationId");
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");
CREATE INDEX "Job_type_idx" ON "Job"("type");
CREATE INDEX "Job_ownerId_idx" ON "Job"("ownerId");
CREATE INDEX "Job_avatarAgentId_idx" ON "Job"("avatarAgentId");

ALTER TABLE "AvatarAgent" ADD CONSTRAINT "AvatarAgent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_publicSessionId_fkey" FOREIGN KEY ("publicSessionId") REFERENCES "PublicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicSession" ADD CONSTRAINT "PublicSession_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicSession" ADD CONSTRAINT "PublicSession_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealtimeSession" ADD CONSTRAINT "RealtimeSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtimeSession" ADD CONSTRAINT "RealtimeSession_publicSessionId_fkey" FOREIGN KEY ("publicSessionId") REFERENCES "PublicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealtimeSession" ADD CONSTRAINT "RealtimeSession_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_publicSessionId_fkey" FOREIGN KEY ("publicSessionId") REFERENCES "PublicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
