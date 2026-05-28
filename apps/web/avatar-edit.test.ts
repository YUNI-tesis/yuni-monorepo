import { afterEach, describe, expect, it, vi } from "vitest";
import { updateAvatar, type ApiAvatar } from "./lib/api/avatar-api";
import type { ApiLiveAvatarOption } from "./lib/api/live-avatar-api";
import {
  buildUpdateAvatarRequest,
  createAvatarEditStateFromAvatar,
  getVoiceEditOptions,
  validateAvatarEditState,
} from "./hooks/useAvatarEdit";

const avatar: ApiAvatar = {
  id: "avatar-1",
  name: "YUNI Demo",
  description: "Avatar de prueba",
  instructions: "Responde claro.",
  context: "Contexto base",
  voiceConfig: {
    provider: "openai",
    voiceId: "alloy",
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
    const payload = buildUpdateAvatarRequest(createAvatarEditStateFromAvatar(avatar), liveAvatarOption);

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
        speakingRate: 1,
      },
    });
    expect(payload).not.toHaveProperty("ownerId");
  });

  it("keeps current voice option when provider catalog does not contain it", () => {
    expect(getVoiceEditOptions("provider-voice-42")[0]).toMatchObject({
      id: "provider-voice-42",
      name: "Voz actual",
    });
  });
});
