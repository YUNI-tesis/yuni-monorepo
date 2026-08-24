import { describe, expect, it } from "vitest";
import type { AvatarAgentRecord } from "./domains/avatars/repository";
import { toAvatarListItemDto } from "./domains/avatars/service";

function createAvatarRecord(overrides: Partial<AvatarAgentRecord> = {}): AvatarAgentRecord {
  const timestamp = new Date("2026-08-16T12:00:00.000Z");

  return {
    id: "avatar-1",
    ownerId: "owner-1",
    name: "Ada",
    description: "Una profesora de ciencias.",
    instructions: "Explica con claridad.",
    context: "",
    voiceConfig: {
      provider: "openai",
      voiceId: "alloy",
      speakingRate: 1,
    },
    liveAvatarConfig: {
      provider: "liveavatar",
      avatarId: "visual-1",
      displayName: "Ada visual",
      thumbnailUrl: "https://cdn.yuni.test/ada.webp",
      mode: "lite",
      sandbox: true,
    },
    agentProvider: "elevenlabs_agents",
    providerAgentId: "agent-1",
    providerSyncStatus: "synced",
    providerSyncError: null,
    providerSyncedAt: timestamp,
    providerSyncFingerprint: "fingerprint-1",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe("avatar list DTO", () => {
  it("exposes only a validated http(s) thumbnail", () => {
    const dto = toAvatarListItemDto(createAvatarRecord(), "owner");

    expect(dto.thumbnailUrl).toBe("https://cdn.yuni.test/ada.webp");
    expect(dto).not.toHaveProperty("providerAgentId");
    expect(dto).not.toHaveProperty("liveAvatarConfig");

    expect(
      toAvatarListItemDto(
        createAvatarRecord({
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: "visual-1",
            thumbnailUrl: "not-a-url",
            mode: "lite",
            sandbox: true,
          },
        }),
        "owner"
      ).thumbnailUrl
    ).toBeNull();

    expect(
      toAvatarListItemDto(
        createAvatarRecord({
          liveAvatarConfig: {
            provider: "liveavatar",
            avatarId: "visual-1",
            mode: "lite",
            sandbox: true,
          },
        }),
        "owner"
      ).thumbnailUrl
    ).toBeNull();
  });

  it.each([
    ["valid owner", "owner", {}, "ready"],
    ["owner with pending sync", "owner", { providerSyncStatus: "not_synced" }, "preparing"],
    [
      "owner syncing a new version while a previous version remains usable",
      "owner",
      {
        providerSyncStatus: "syncing",
        providerLastUsableAt: new Date("2026-08-16T12:00:00.000Z"),
      },
      "ready",
    ],
    ["owner with failed sync", "owner", { providerSyncStatus: "failed" }, "needs_attention"],
    [
      "owner with failed sync and a previous usable version",
      "owner",
      {
        providerSyncStatus: "failed",
        providerLastUsableAt: new Date("2026-08-16T12:00:00.000Z"),
      },
      "ready",
    ],
    ["shared and synced", "shared", {}, "ready"],
    ["shared while syncing", "shared", { providerSyncStatus: "not_synced" }, "preparing"],
    ["shared with a synced state but no provider agent", "shared", { providerAgentId: null }, "unavailable"],
    [
      "owner with a synced state but no provider agent",
      "owner",
      { providerAgentId: null },
      "needs_attention",
    ],
    ["shared with failed sync", "shared", { providerSyncStatus: "failed" }, "unavailable"],
    [
      "shared with failed sync and a previous usable version",
      "shared",
      {
        providerSyncStatus: "failed",
        providerLastUsableAt: new Date("2026-08-16T12:00:00.000Z"),
      },
      "ready",
    ],
  ] as const)("resolves %s as %s", (_name, accessType, overrides, expected) => {
    const dto = toAvatarListItemDto(createAvatarRecord(overrides as Partial<AvatarAgentRecord>), accessType);

    expect(dto.interactionAvailability).toBe(expected);
  });

  it("requires both voice and visual configuration", () => {
    const invalidVoice = createAvatarRecord({ voiceConfig: null });
    const invalidVisual = createAvatarRecord({ liveAvatarConfig: null });

    expect(toAvatarListItemDto(invalidVoice, "owner").interactionAvailability).toBe("needs_attention");
    expect(toAvatarListItemDto(invalidVisual, "owner").interactionAvailability).toBe("needs_attention");
    expect(toAvatarListItemDto(invalidVoice, "shared").interactionAvailability).toBe("unavailable");
    expect(toAvatarListItemDto(invalidVisual, "shared").interactionAvailability).toBe("unavailable");
  });
});
