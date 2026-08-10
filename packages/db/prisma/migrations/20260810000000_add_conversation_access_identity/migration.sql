-- AlterTable
ALTER TABLE "Conversation"
ADD COLUMN "accessGrantId" TEXT,
ADD COLUMN "participantEmail" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_accessGrantId_idx" ON "Conversation"("accessGrantId");

-- AddForeignKey
ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_accessGrantId_fkey"
FOREIGN KEY ("accessGrantId") REFERENCES "AccessGrant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
