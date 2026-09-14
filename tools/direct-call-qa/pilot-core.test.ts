import { describe, expect, it, vi } from "vitest";
import {
  parsePilotArgs,
  runPilot,
  safeVoiceState,
  type PilotAvatar,
  type PilotDependencies,
  type PilotOptions,
} from "./pilot-core";

const time = "2026-09-13T15:00:00.000Z";
const voiceState = {
  requestedModel: "eleven_v3",
  effectiveModel: "eleven_v3",
  expressiveMode: true,
  fallbackReason: null,
  verifiedAt: time,
  profile: "standard" as "standard" | "natural",
};
const naturalVoiceState = {
  ...voiceState,
  requestedModel: "eleven_v3_conversational",
  effectiveModel: "eleven_v3_conversational",
  profile: "natural" as const,
};
const applyNatural: PilotOptions = {
  avatarId: "avatar-1",
  apply: true,
  profile: "natural",
  retryExpressive: false,
};

function fixture() {
  let avatar: PilotAvatar = {
    voiceConfig: {
      provider: "elevenlabs",
      voiceId: "existing-voice",
      speakingRate: 0.93,
      displayName: "PRIVATE voice label",
      description: "PRIVATE description",
    },
    providerAgentId: "agent-1",
    providerSyncStatus: "synced",
    providerVoiceState: { ...voiceState, verifiedAt: "2026-09-12T15:00:00.000Z" },
    knowledgeBase: { contextDocumentId: "context-1", fileDocumentIds: ["file-2", "file-1"] },
  };
  let lockHeld = false;
  const order: string[] = [];
  const dependencies: PilotDependencies = {
    requestedModel: (profile) => (profile === "natural" ? "eleven_v3_conversational" : "eleven_v3"),
    now: () => new Date(time),
    findAvatar: vi.fn(async () => {
      order.push("read");
      return avatar;
    }),
    countLiveSessions: vi.fn(async () => 0),
    inspectVoice: vi.fn(async (_agentId, _requestedModel, profile) =>
      profile === "natural" ? naturalVoiceState : voiceState
    ),
    updateVoiceConfig: vi.fn(async (_avatarId, config) => {
      expect(lockHeld).toBe(true);
      order.push("update");
      avatar = { ...avatar, voiceConfig: config, providerSyncStatus: "syncing" };
    }),
    syncAgent: vi.fn(async () => {
      expect(lockHeld).toBe(true);
      order.push("sync");
      const config = avatar.voiceConfig as { conversationProfile: "natural" | "standard" };
      avatar = {
        ...avatar,
        providerSyncStatus: "synced",
        providerVoiceState: config.conversationProfile === "natural" ? naturalVoiceState : voiceState,
      };
    }),
    markFailed: vi.fn(async () => {
      avatar = { ...avatar, providerSyncStatus: "failed" };
    }),
    runWithAvatarLock: vi.fn(async (_avatarId, operation) => {
      order.push("lock");
      lockHeld = true;
      try {
        return { acquired: true as const, value: await operation() };
      } finally {
        lockHeld = false;
      }
    }),
  };
  return {
    dependencies,
    order,
    getAvatar: () => avatar,
    setAvatar: (value: PilotAvatar) => {
      avatar = value;
    },
  };
}

describe("direct call pilot arguments", () => {
  it("defaults to inspection, and requires an explicit target profile before writing", () => {
    expect(parsePilotArgs(["--avatar-id", "avatar-1"])).toEqual({
      avatarId: "avatar-1",
      apply: false,
      retryExpressive: false,
    });
    expect(() => parsePilotArgs(["--avatar-id", "avatar-1", "--apply"])).toThrow();
    expect(() => parsePilotArgs(["--avatar-id", "avatar-1", "--retry-expressive"])).toThrow();
    expect(() => parsePilotArgs(["--apply", "--profile", "natural"])).toThrow();
    expect(() => parsePilotArgs(["--avatar-id", "avatar-1", "--profile", "unexpected"])).toThrow();
    expect(() => parsePilotArgs(["--avatar-id", "avatar-1", "--avatar-id", "avatar-2"])).toThrow();
  });
});

describe("direct call pilot", () => {
  it("inspects remote state and plans without locking or changing local or remote configuration", async () => {
    const { dependencies } = fixture();
    const result = await runPilot({ ...applyNatural, apply: false }, dependencies);
    expect(result).toMatchObject({
      status: "inspected",
      currentProfile: "standard",
      targetProfile: "natural",
      remoteVoice: voiceState,
    });
    expect(dependencies.inspectVoice).toHaveBeenCalledWith("agent-1", "eleven_v3", "standard");
    expect(dependencies.runWithAvatarLock).not.toHaveBeenCalled();
    expect(dependencies.updateVoiceConfig).not.toHaveBeenCalled();
    expect(dependencies.syncAgent).not.toHaveBeenCalled();
    expect(dependencies.markFailed).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("does not create an agent during inspection when none is linked", async () => {
    const { dependencies, getAvatar, setAvatar } = fixture();
    setAvatar({ ...getAvatar(), providerAgentId: null });
    const result = await runPilot({ ...applyNatural, apply: false }, dependencies);
    expect(result).toMatchObject({ status: "inspected", providerLinked: false, remoteVoice: null });
    expect(dependencies.inspectVoice).not.toHaveBeenCalled();
    expect(dependencies.syncAgent).not.toHaveBeenCalled();
  });

  it("reads inside the provider lock, preserves every voice field and invokes only direct sync", async () => {
    const { dependencies, order, getAvatar } = fixture();
    const originalConfig = getAvatar().voiceConfig as Record<string, unknown>;
    const result = await runPilot({ ...applyNatural, retryExpressive: true }, dependencies);
    expect(result).toMatchObject({
      status: "applied",
      currentProfile: "natural",
      remoteState: "verified",
      localKnowledgeBase: { contextAttached: true, syncedFileCount: 2 },
      localKnowledgeBaseReferencesUnchanged: true,
      remoteVoice: { requestedModel: "eleven_v3_conversational", effectiveModel: "eleven_v3_conversational" },
    });
    expect(order).toEqual(["lock", "read", "update", "sync", "read"]);
    expect(dependencies.updateVoiceConfig).toHaveBeenCalledWith("avatar-1", {
      ...originalConfig,
      conversationProfile: "natural",
    });
    expect(dependencies.syncAgent).toHaveBeenCalledExactlyOnceWith("avatar-1", {
      retryExpressive: true,
      verifyVoice: true,
    });
  });

  it("blocks active or connecting calls before updating any config", async () => {
    const { dependencies } = fixture();
    vi.mocked(dependencies.countLiveSessions).mockResolvedValue(2);
    const result = await runPilot(applyNatural, dependencies);
    expect(result).toMatchObject({
      status: "blocked",
      reason: "active_or_connecting_sessions",
      liveSessions: 2,
    });
    expect(dependencies.updateVoiceConfig).not.toHaveBeenCalled();
    expect(dependencies.syncAgent).not.toHaveBeenCalled();
    expect(dependencies.markFailed).not.toHaveBeenCalled();
  });

  it("does not read or mutate an avatar whose provider lock is busy", async () => {
    const { dependencies } = fixture();
    dependencies.runWithAvatarLock = async () => ({ acquired: false });
    expect(await runPilot(applyNatural, dependencies)).toMatchObject({
      status: "blocked",
      reason: "avatar_provider_lock_busy",
    });
    expect(dependencies.findAvatar).not.toHaveBeenCalled();
    expect(dependencies.syncAgent).not.toHaveBeenCalled();
  });

  it("rejects invalid voice configuration before writing instead of dropping unknown fields", async () => {
    const { dependencies, setAvatar, getAvatar } = fixture();
    setAvatar({
      ...getAvatar(),
      voiceConfig: { provider: "elevenlabs", voiceId: "voice", unsupported: true },
    });
    expect(await runPilot(applyNatural, dependencies)).toMatchObject({
      status: "blocked",
      reason: "invalid_voice_config",
    });
    expect(dependencies.updateVoiceConfig).not.toHaveBeenCalled();
  });

  it("records failure without reverting local intent or exposing raw provider errors", async () => {
    const { dependencies, getAvatar } = fixture();
    vi.mocked(dependencies.syncAgent).mockRejectedValue(
      new Error("PRIVATE provider body with key and prompt")
    );
    const result = await runPilot(applyNatural, dependencies);
    expect(result).toMatchObject({
      status: "failed",
      reason: "sync_or_verification_failed",
      currentProfile: "natural",
      failureStateRecorded: true,
      remoteState: "unknown",
    });
    expect(getAvatar()).toMatchObject({
      voiceConfig: { conversationProfile: "natural" },
      providerSyncStatus: "failed",
    });
    expect(dependencies.updateVoiceConfig).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("reports when recording the failed state also fails", async () => {
    const { dependencies } = fixture();
    vi.mocked(dependencies.syncAgent).mockRejectedValue(new Error("network"));
    vi.mocked(dependencies.markFailed).mockRejectedValue(new Error("database"));
    expect(await runPilot(applyNatural, dependencies)).toMatchObject({
      status: "failed",
      remoteState: "unknown",
      failureStateRecorded: false,
    });
  });

  it("does not claim success based on a stale persisted verification", async () => {
    const { dependencies, getAvatar, setAvatar } = fixture();
    vi.mocked(dependencies.syncAgent).mockImplementation(async () => {
      setAvatar({
        ...getAvatar(),
        providerSyncStatus: "synced",
        providerVoiceState: { ...naturalVoiceState, verifiedAt: "2026-09-12T15:00:00.000Z" },
      });
    });
    const result = await runPilot(applyNatural, dependencies);
    expect(result).toMatchObject({ status: "failed", remoteState: "unknown" });
    expect(dependencies.markFailed).toHaveBeenCalledWith("avatar-1");
  });

  it("does not claim preservation when synced knowledge references change during application", async () => {
    const { dependencies, getAvatar, setAvatar } = fixture();
    vi.mocked(dependencies.syncAgent).mockImplementation(async () => {
      setAvatar({
        ...getAvatar(),
        providerSyncStatus: "synced",
        providerVoiceState: naturalVoiceState,
        knowledgeBase: { contextDocumentId: null, fileDocumentIds: [] },
      });
    });
    const result = await runPilot(applyNatural, dependencies);
    expect(result).toMatchObject({ status: "failed", remoteState: "unknown" });
    expect(result.localKnowledgeBaseReferencesUnchanged).not.toBe(true);
    expect(dependencies.markFailed).toHaveBeenCalledWith("avatar-1");
  });

  it("distinguishes verified fallback from the requested v3 model", async () => {
    const { dependencies, getAvatar, setAvatar } = fixture();
    vi.mocked(dependencies.syncAgent).mockImplementation(async () => {
      setAvatar({
        ...getAvatar(),
        providerSyncStatus: "synced",
        providerVoiceState: {
          ...naturalVoiceState,
          effectiveModel: "eleven_flash_v2_5",
          expressiveMode: false,
          fallbackReason: "expressive_tts_not_allowed",
        },
      });
    });
    expect(await runPilot(applyNatural, dependencies)).toMatchObject({
      status: "applied_with_fallback",
      remoteVoice: { effectiveModel: "eleven_flash_v2_5", expressiveMode: false },
    });
  });

  it("rolls back to standard through the same verified worker path", async () => {
    const { dependencies, getAvatar, setAvatar } = fixture();
    setAvatar({
      ...getAvatar(),
      voiceConfig: {
        ...(getAvatar().voiceConfig as Record<string, unknown>),
        conversationProfile: "natural",
      },
    });
    expect(await runPilot({ ...applyNatural, profile: "standard" }, dependencies)).toMatchObject({
      status: "applied",
      currentProfile: "standard",
      remoteVoice: { profile: "standard" },
    });
    expect(dependencies.syncAgent).toHaveBeenCalledExactlyOnceWith("avatar-1", {
      retryExpressive: false,
      verifyVoice: true,
    });
  });

  it("inspects a natural avatar using the conversational model while a standard rollback is only planned", async () => {
    const { dependencies, getAvatar, setAvatar } = fixture();
    setAvatar({
      ...getAvatar(),
      voiceConfig: {
        ...(getAvatar().voiceConfig as Record<string, unknown>),
        conversationProfile: "natural",
      },
    });
    expect(
      await runPilot({ ...applyNatural, apply: false, profile: "standard" }, dependencies)
    ).toMatchObject({
      status: "inspected",
      currentProfile: "natural",
      targetProfile: "standard",
      remoteVoice: naturalVoiceState,
    });
    expect(dependencies.inspectVoice).toHaveBeenCalledWith("agent-1", "eleven_v3_conversational", "natural");
    expect(dependencies.syncAgent).not.toHaveBeenCalled();
  });

  it("keeps inspection failures read-only and strips unexpected metadata from safe voice reports", async () => {
    const { dependencies } = fixture();
    vi.mocked(dependencies.inspectVoice).mockRejectedValue(new Error("PRIVATE remote config"));
    const result = await runPilot({ ...applyNatural, apply: false }, dependencies);
    expect(result).toMatchObject({ status: "failed", reason: "voice_inspection_failed" });
    expect(dependencies.markFailed).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(safeVoiceState({ ...voiceState, prompt: "PRIVATE", fallbackReason: "PRIVATE" })).toEqual({
      ...voiceState,
      fallbackReason: "other",
    });
    expect(safeVoiceState({ ...voiceState, effectiveModel: "user@example.com" })).toBeNull();
  });

  it.each([
    "voice_verification_failed",
    "expressive_mode_disabled",
    "expressive_mode_unverified",
    "expressive_mode_unexpected",
  ])("retains the safe provider verification diagnosis %s", (fallbackReason) => {
    expect(safeVoiceState({ ...voiceState, fallbackReason })?.fallbackReason).toBe(fallbackReason);
  });
});
