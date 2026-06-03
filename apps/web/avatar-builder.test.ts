import { afterEach, describe, expect, it, vi } from "vitest";
import { createAvatar } from "./lib/api/avatar-api";
import { getLiveAvatarOptions } from "./lib/api/live-avatar-api";
import {
  buildCreateAvatarRequest,
  createInitialAvatarBuilderState,
  validateAvatarBuilderState,
} from "./hooks/useAvatarBuilder";
import type { ApiLiveAvatarOption } from "./lib/api/live-avatar-api";
import { createVoiceConfig, voiceOptions } from "./lib/voice-config";

const liveAvatarOption: ApiLiveAvatarOption = {
  id: "demo-guide",
  displayName: "Guia cercano",
  thumbnailUrl: "https://cdn.yuni.test/demo-guide.png",
  provider: "liveavatar",
  mode: "lite",
  sandbox: true,
};

describe("avatar builder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes with safe defaults", () => {
    const state = createInitialAvatarBuilderState();

    expect(state.liveAvatarId).toBe("");
    expect(state.voiceId).toBeTruthy();
    expect(state.files).toEqual([]);
  });

  it("requires name and instructions before saving", () => {
    const state = createInitialAvatarBuilderState();

    expect(validateAvatarBuilderState(state)).toMatchObject({
      name: "El nombre es obligatorio.",
      instructions: "Las instrucciones son obligatorias.",
    });
  });

  it("builds a create payload with live avatar lite sandbox and no ownerId", () => {
    const state = {
      ...createInitialAvatarBuilderState(),
      name: "YUNI Demo",
      description: "Avatar de prueba",
      instructions: "Responde claro.",
      context: "Contexto base",
    };

    const selectedVoice = voiceOptions.find((option) => option.id === state.voiceId) ?? null;
    const payload = buildCreateAvatarRequest(state, liveAvatarOption, selectedVoice);

    expect(payload).toMatchObject({
      name: "YUNI Demo",
      status: "active",
      liveAvatarConfig: {
        provider: "liveavatar",
        displayName: "Guia cercano",
        thumbnailUrl: "https://cdn.yuni.test/demo-guide.png",
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

  it("creates voice config with catalog metadata", () => {
    expect(
      createVoiceConfig({
        voiceId: "verse",
        selectedVoice: voiceOptions.find((option) => option.id === "verse"),
      })
    ).toEqual({
      provider: "openai",
      voiceId: "verse",
      displayName: "Verse",
      description: "Voz cálida con un ritmo más expresivo.",
      speakingRate: 1,
    });
  });

  it("sends create avatar requests with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          avatar: {
            id: "avatar_1",
            name: "YUNI Demo",
            description: "",
            instructions: "Responde claro.",
            context: "",
            voiceConfig: {},
            liveAvatarConfig: {},
            status: "active",
            createdAt: "2026-05-21T00:00:00.000Z",
            updatedAt: "2026-05-21T00:00:00.000Z",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAvatar(
      buildCreateAvatarRequest({
        ...createInitialAvatarBuilderState(),
        name: "YUNI Demo",
        instructions: "Responde claro.",
      })
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/avatars",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
  });

  it("fetches live avatar options with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ avatars: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getLiveAvatarOptions();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/live-avatar/avatars",
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

});
