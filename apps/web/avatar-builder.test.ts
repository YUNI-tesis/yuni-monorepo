import { afterEach, describe, expect, it, vi } from "vitest";
import { createAvatar } from "./lib/api/avatar-api";
import { getLiveAvatarOptions } from "./lib/api/live-avatar-api";
import { getElevenLabsVoiceOptions } from "./lib/api/voice-provider-api";
import {
  buildCreateAvatarRequest,
  createInitialAvatarBuilderState,
  validateAvatarBuilderState,
} from "./hooks/useAvatarBuilder";
import type { ApiLiveAvatarOption } from "./lib/api/live-avatar-api";
import { createVoiceConfig, type VoiceOption } from "./lib/voice-config";

const liveAvatarOption: ApiLiveAvatarOption = {
  id: "demo-guide",
  displayName: "Guia cercano",
  thumbnailUrl: "https://cdn.yuni.test/demo-guide.png",
  provider: "liveavatar",
  mode: "lite",
  sandbox: true,
};

const voiceOption: VoiceOption = {
  id: "voice-1",
  displayName: "Agustin",
  description: "Relaxed, warm and approachable.",
  provider: "elevenlabs",
  toneLabel: "Warm",
  recommendedFor: "Conversaciones naturales.",
  previewUrl: "https://cdn.elevenlabs.test/voice-1.mp3",
};

describe("avatar builder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes with safe defaults", () => {
    const state = createInitialAvatarBuilderState();

    expect(state.liveAvatarId).toBe("");
    expect(state.voiceId).toBe("");
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
      voiceId: "voice-1",
      instructions: "Responde claro.",
      context: "Contexto base",
    };

    const payload = buildCreateAvatarRequest(state, liveAvatarOption, voiceOption);

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
        provider: "elevenlabs",
        voiceId: "voice-1",
        displayName: "Agustin",
        description: "Relaxed, warm and approachable.",
        speakingRate: 1,
      },
    });
    expect(payload).not.toHaveProperty("ownerId");
  });

  it("creates voice config with catalog metadata", () => {
    expect(
      createVoiceConfig({
        voiceId: "voice-1",
        selectedVoice: voiceOption,
      })
    ).toEqual({
      provider: "elevenlabs",
      voiceId: "voice-1",
      displayName: "Agustin",
      description: "Relaxed, warm and approachable.",
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
      buildCreateAvatarRequest(
        {
          ...createInitialAvatarBuilderState(),
          name: "YUNI Demo",
          voiceId: "voice-1",
          instructions: "Responde claro.",
        },
        undefined,
        voiceOption
      )
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

  it("fetches ElevenLabs voice options with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ voices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getElevenLabsVoiceOptions();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/voice-providers/elevenlabs/voices",
      expect.objectContaining({
        credentials: "include",
      })
    );
  });
});
