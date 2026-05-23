import { afterEach, describe, expect, it, vi } from "vitest";
import { createAvatar } from "./lib/api-client";
import {
  buildCreateAvatarRequest,
  createInitialAvatarBuilderState,
  validateAvatarBuilderState,
} from "./hooks/useAvatarBuilder";

describe("avatar builder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes with safe defaults", () => {
    const state = createInitialAvatarBuilderState();

    expect(state.liveAvatarId).toBeTruthy();
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

    const payload = buildCreateAvatarRequest(state);

    expect(payload).toMatchObject({
      name: "YUNI Demo",
      status: "active",
      liveAvatarConfig: {
        provider: "liveavatar",
        mode: "lite",
        sandbox: true,
      },
      voiceConfig: {
        provider: "openai",
        speakingRate: 1,
      },
    });
    expect(payload).not.toHaveProperty("ownerId");
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
});
