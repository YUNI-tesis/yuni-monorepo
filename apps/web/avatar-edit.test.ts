import { afterEach, describe, expect, it, vi } from "vitest";
import { updateAvatar, type ApiAvatar } from "./lib/api/avatar-api";
import type { ApiLiveAvatarOption } from "./lib/api/live-avatar-api";
import {
  buildUpdateAvatarRequest,
  createAvatarEditStateFromAvatar,
  validateAvatarEditState,
} from "./hooks/useAvatarEdit";
import { withCurrentVoiceOption } from "./hooks/useElevenLabsVoiceOptions";
import type { VoiceOption } from "./lib/voice-config";

const voiceOption: VoiceOption = {
  id: "voice-1",
  displayName: "Agustin",
  description: "Relaxed, warm and approachable.",
  provider: "elevenlabs",
  toneLabel: "Warm",
  recommendedFor: "Conversaciones naturales.",
  previewUrl: "https://cdn.elevenlabs.test/voice-1.mp3",
};

const avatar: ApiAvatar = {
  id: "avatar-1",
  name: "YUNI Demo",
  description: "Avatar de prueba",
  instructions: "Responde claro.",
  context: "Contexto base",
  voiceConfig: {
    provider: "elevenlabs",
    voiceId: "voice-1",
    displayName: "Agustin",
    description: "Relaxed, warm and approachable.",
    speakingRate: 1,
  },
  liveAvatarConfig: {
    provider: "liveavatar",
    avatarId: "demo-guide",
    displayName: "Guia cercano",
    thumbnailUrl: "https://cdn.yuni.test/demo-guide.png",
    mode: "lite",
    sandbox: true,
  },
  agentProvider: "elevenlabs_agents",
  providerAgentId: null,
  providerSyncStatus: "not_synced",
  providerSyncError: null,
  providerSyncedAt: null,
  providerSyncFingerprint: null,
  status: "active",
  createdAt: "2026-05-21T13:30:00.000Z",
  updatedAt: "2026-05-21T14:45:00.000Z",
};

const liveAvatarOption: ApiLiveAvatarOption = {
  id: "demo-guide",
  displayName: "Guia cercano actualizado",
  thumbnailUrl: "https://cdn.yuni.test/demo-guide-updated.png",
  provider: "liveavatar",
  mode: "lite",
  sandbox: true,
};

describe("avatar edit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches avatar updates with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ avatar }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateAvatar("avatar-1", buildUpdateAvatarRequest(createAvatarEditStateFromAvatar(avatar)));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/avatars/avatar-1",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      })
    );
  });

  it("maps avatar API data into editable state", () => {
    expect(createAvatarEditStateFromAvatar(avatar)).toMatchObject({
      name: "YUNI Demo",
      description: "Avatar de prueba",
      status: "active",
      instructions: "Responde claro.",
      context: "Contexto base",
      liveAvatarId: "demo-guide",
      liveAvatarDisplayName: "Guia cercano",
      liveAvatarThumbnailUrl: "https://cdn.yuni.test/demo-guide.png",
      voiceProvider: "elevenlabs",
      voiceId: "voice-1",
      voiceDisplayName: "Agustin",
      voiceDescription: "Relaxed, warm and approachable.",
      files: [],
    });
  });

  it("validates required edit fields", () => {
    const state = {
      ...createAvatarEditStateFromAvatar(avatar),
      name: "",
      instructions: "",
    };

    expect(validateAvatarEditState(state)).toMatchObject({
      name: "El nombre es obligatorio.",
      instructions: "Las instrucciones son obligatorias.",
    });
  });

  it("builds an update payload without ownerId and with live avatar lite sandbox", () => {
    const state = createAvatarEditStateFromAvatar(avatar);
    const payload = buildUpdateAvatarRequest(state, liveAvatarOption, voiceOption);

    expect(payload).toMatchObject({
      name: "YUNI Demo",
      status: "active",
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: "demo-guide",
        displayName: "Guia cercano actualizado",
        thumbnailUrl: "https://cdn.yuni.test/demo-guide-updated.png",
        mode: "lite",
        sandbox: true,
      },
      voiceConfig: {
        provider: "elevenlabs",
        voiceId: "voice-1",
        displayName: "Agustin",
        description: "Relaxed, warm and approachable.",
        speakingRate: 1,
      },
    });
    expect(payload).not.toHaveProperty("ownerId");
  });

  it("keeps current voice option when provider catalog does not contain it", () => {
    expect(withCurrentVoiceOption([], { currentVoiceId: "provider-voice-42" })[0]).toMatchObject({
      id: "provider-voice-42",
      displayName: "Voz actual",
      toneLabel: "Actual",
    });
  });

  it("preserves current voice metadata when it is not in the catalog", () => {
    const customAvatar = {
      ...avatar,
      voiceConfig: {
        provider: "elevenlabs",
        voiceId: "provider-voice-42",
        displayName: "Provider Voice",
        description: "Voz traída desde provider.",
        speakingRate: 1,
      },
    };
    const state = createAvatarEditStateFromAvatar(customAvatar);
    const selectedVoice =
      withCurrentVoiceOption([], {
        currentVoiceId: state.voiceId,
        currentVoiceDisplayName: state.voiceDisplayName,
        currentVoiceDescription: state.voiceDescription,
        currentVoiceProvider: state.voiceProvider,
      }).find((option) => option.id === state.voiceId) ?? null;

    expect(buildUpdateAvatarRequest(state, liveAvatarOption, selectedVoice).voiceConfig).toEqual({
      provider: "elevenlabs",
      voiceId: "provider-voice-42",
      displayName: "Provider Voice",
      description: "Voz traída desde provider.",
      speakingRate: 1,
    });
  });
});
