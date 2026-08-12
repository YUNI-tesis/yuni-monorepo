ALTER TABLE "PublicSession"
ALTER COLUMN "anonymousId" DROP NOT NULL,
ALTER COLUMN "shareLinkId" DROP NOT NULL,
ADD COLUMN "participantEmail" TEXT,
ADD COLUMN "participantUserId" TEXT,
ADD COLUMN "consentedAt" TIMESTAMP(3),
ADD COLUMN "expiresAt" TIMESTAMP(3);

ALTER TABLE "PublicSession"
DROP CONSTRAINT "PublicSession_shareLinkId_fkey";

ALTER TABLE "PublicSession"
ADD CONSTRAINT "PublicSession_shareLinkId_fkey"
FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PublicSession_shareLinkId_participantEmail_idx"
ON "PublicSession"("shareLinkId", "participantEmail");

CREATE INDEX "PublicSession_avatarAgentId_participantEmail_idx"
ON "PublicSession"("avatarAgentId", "participantEmail");

CREATE INDEX "PublicSession_participantUserId_idx"
ON "PublicSession"("participantUserId");

ALTER TABLE "PublicSession"
ADD CONSTRAINT "PublicSession_participantUserId_fkey"
FOREIGN KEY ("participantUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
