ALTER TABLE "GroupVoiceRound" RENAME COLUMN "contributions" TO "routingPlan";

ALTER TABLE "GroupPlannedTurn" RENAME COLUMN "responseText" TO "instructionText";
ALTER TABLE "GroupPlannedTurn" RENAME COLUMN "providerText" TO "responseText";
