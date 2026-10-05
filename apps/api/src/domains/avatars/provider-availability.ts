import { getVerifiedConversationProfile, VoiceConfigSchema } from "@yuni/domain";

export type AvatarProviderAvailabilityRecord = {
  providerAgentId: string | null;
  providerSyncStatus: "not_synced" | "syncing" | "synced" | "failed";
  providerLastUsableAt?: Date | null;
  voiceConfig?: unknown;
  providerVoiceState?: unknown;
};

export function hasUsableAvatarProviderVersion<T extends AvatarProviderAvailabilityRecord>(
  record: T
): record is T & { providerAgentId: string } {
  const voice = VoiceConfigSchema.safeParse(record.voiceConfig);
  const isNatural =
    (voice.success && voice.data.conversationProfile === "natural") ||
    getVerifiedConversationProfile(record.providerVoiceState) === "natural";
  if (isNatural && record.providerSyncStatus !== "synced") return false;
  return Boolean(
    record.providerAgentId && (record.providerSyncStatus === "synced" || record.providerLastUsableAt)
  );
}

export function hasTerminalAvatarProviderFailure(record: AvatarProviderAvailabilityRecord) {
  return (
    !hasUsableAvatarProviderVersion(record) &&
    (record.providerSyncStatus === "failed" || record.providerSyncStatus === "synced")
  );
}
