export type AvatarProviderAvailabilityRecord = {
  providerAgentId: string | null;
  providerSyncStatus: "not_synced" | "syncing" | "synced" | "failed";
  providerLastUsableAt?: Date | null;
};

export function hasUsableAvatarProviderVersion<T extends AvatarProviderAvailabilityRecord>(
  record: T
): record is T & { providerAgentId: string } {
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
