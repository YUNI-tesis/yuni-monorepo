-- CreateEnum
CREATE TYPE "GroupVoiceInterruptionOutcome" AS ENUM ('interrupted', 'stale');

-- CreateTable
CREATE TABLE "GroupVoiceInterruptionEvent" (
    "id" TEXT NOT NULL,
    "groupVoiceSessionId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "outcome" "GroupVoiceInterruptionOutcome" NOT NULL,
    "interruptedAvatarId" TEXT,
    "spokenFragmentLength" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupVoiceInterruptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupVoiceInterruptionEvent_groupVoiceSessionId_sourceEvent_key"
    ON "GroupVoiceInterruptionEvent"("groupVoiceSessionId", "sourceEventId");

-- CreateIndex
CREATE INDEX "GroupVoiceInterruptionEvent_groupVoiceSessionId_createdAt_idx"
    ON "GroupVoiceInterruptionEvent"("groupVoiceSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupVoiceInterruptionEvent_roundId_idx"
    ON "GroupVoiceInterruptionEvent"("roundId");

-- CreateIndex
CREATE INDEX "GroupVoiceInterruptionEvent_turnId_idx"
    ON "GroupVoiceInterruptionEvent"("turnId");

-- AddForeignKey
ALTER TABLE "GroupVoiceInterruptionEvent"
    ADD CONSTRAINT "GroupVoiceInterruptionEvent_groupVoiceSessionId_fkey"
    FOREIGN KEY ("groupVoiceSessionId") REFERENCES "GroupVoiceSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupVoiceInterruptionEvent"
    ADD CONSTRAINT "GroupVoiceInterruptionEvent_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "GroupVoiceRound"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupVoiceInterruptionEvent"
    ADD CONSTRAINT "GroupVoiceInterruptionEvent_turnId_fkey"
    FOREIGN KEY ("turnId") REFERENCES "GroupPlannedTurn"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
