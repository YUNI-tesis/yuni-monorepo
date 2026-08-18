-- Existing avatars currently depend on inline prompt context. Queue a durable
-- migration so the worker creates the text document before removing that fallback.
-- This must run after the migration that extends JobType because PostgreSQL does
-- not allow using a new enum value in the same transaction that creates it.
INSERT INTO "Job" (
  "id",
  "ownerId",
  "avatarAgentId",
  "type",
  "status",
  "payload",
  "attempts",
  "maxAttempts",
  "dedupeKey",
  "createdAt",
  "updatedAt"
)
SELECT
  'kbctx_' || substr(md5("id"), 1, 24),
  "ownerId",
  "id",
  'avatar_context_provider_sync'::"JobType",
  'queued'::"JobStatus",
  jsonb_build_object('avatarId', "id"),
  0,
  8,
  'avatar-context-migration:' || "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AvatarAgent"
ON CONFLICT ("dedupeKey") DO NOTHING;
