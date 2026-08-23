-- PostgreSQL truncates identifiers to 63 bytes. The previous migration used
-- longer explicit names, while Prisma reserves space for the `_key`/`_idx`
-- suffixes when deriving the expected identifiers.
ALTER INDEX "GroupVoiceParticipantFailureEvent_groupVoiceSessionId_sourceEve"
  RENAME TO "GroupVoiceParticipantFailureEvent_groupVoiceSessionId_sourc_key";

ALTER INDEX "GroupVoiceParticipantFailureEvent_groupVoiceSessionId_createdAt"
  RENAME TO "GroupVoiceParticipantFailureEvent_groupVoiceSessionId_creat_idx";
