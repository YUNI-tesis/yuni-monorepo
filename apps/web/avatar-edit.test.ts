import { afterEach, describe, expect, it, vi } from "vitest";
import { updateAvatar, type ApiAvatar } from "./lib/api/avatar-api";
import type { ApiLiveAvatarOption } from "./lib/api/live-avatar-api";
import {
  buildUpdateAvatarRequest,
  createAvatarEditStateFromAvatar,
  getVoiceEditOptions,
  validateAvatarEditState,
} from "./hooks/useAvatarEdit";
import { voiceOptions } from "./lib/voice-config";

const avatar: ApiAvatar = {
  id: "avatar-1",
  name: "YUNI Demo",
  description: "Avatar de prueba",
  instructions: "Responde claro.",
  context: "Contexto base",
  voiceConfig: {
    provider: "openai",
    voiceId: "alloy",
    displayName: "Alloy",
    description: "Voz equilibrada y natural para conversaciones generales.",
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
      voiceId: "alloy",
      voiceDisplayName: "Alloy",
      voiceDescription: "Voz equilibrada y natural para conversaciones generales.",
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
    const selectedVoice = voiceOptions.find((option) => option.id === state.voiceId) ?? null;
    const payload = buildUpdateAvatarRequest(state, liveAvatarOption, selectedVoice);

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
        provider: "openai",
        voiceId: "alloy",
        displayName: "Alloy",
        description: "Voz equilibrada y natural para conversaciones generales.",
        speakingRate: 1,
      },
    });
    expect(payload).not.toHaveProperty("ownerId");
  });

  it("keeps current voice option when provider catalog does not contain it", () => {
    expect(getVoiceEditOptions("provider-voice-42")[0]).toMatchObject({
      id: "provider-voice-42",
      displayName: "Voz actual",
      toneLabel: "Actual",
    });
  });

  it("preserves current voice metadata when it is not in the catalog", () => {
    const customAvatar = {
      ...avatar,
      voiceConfig: {
        provider: "openai",
        voiceId: "provider-voice-42",
        displayName: "Provider Voice",
        description: "Voz traída desde provider.",
        speakingRate: 1,
      },
    };
    const state = createAvatarEditStateFromAvatar(customAvatar);
    const selectedVoice = getVoiceEditOptions(state.voiceId).find((option) => option.id === state.voiceId) ?? null;

    expect(buildUpdateAvatarRequest(state, liveAvatarOption, selectedVoice).voiceConfig).toEqual({
      provider: "openai",
      voiceId: "provider-voice-42",
      displayName: "Provider Voice",
      description: "Voz traída desde provider.",
      speakingRate: 1,
    });
  });
});
