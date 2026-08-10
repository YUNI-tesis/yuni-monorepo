-- CreateEnum
CREATE TYPE "AccessGrantStatus" AS ENUM ('active', 'revoked');

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "avatarAgentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "participantEmail" TEXT NOT NULL,
    "participantUserId" TEXT,
    "status" "AccessGrantStatus" NOT NULL DEFAULT 'active',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessGrant_avatarAgentId_participantEmail_key" ON "AccessGrant"("avatarAgentId", "participantEmail");

-- CreateIndex
CREATE INDEX "AccessGrant_ownerId_avatarAgentId_idx" ON "AccessGrant"("ownerId", "avatarAgentId");

-- CreateIndex
CREATE INDEX "AccessGrant_participantUserId_status_idx" ON "AccessGrant"("participantUserId", "status");

-- CreateIndex
CREATE INDEX "AccessGrant_participantEmail_status_idx" ON "AccessGrant"("participantEmail", "status");

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_avatarAgentId_fkey" FOREIGN KEY ("avatarAgentId") REFERENCES "AvatarAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
