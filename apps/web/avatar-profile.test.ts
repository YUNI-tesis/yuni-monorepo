import { afterEach, describe, expect, it, vi } from "vitest";
import { getAvatar, type ApiAvatar } from "./lib/api/avatar-api";
import {
  formatAvatarStatus,
  formatDateTime,
  getLiveAvatarSummary,
  getVoiceSummary,
} from "./components/avatar-profile/formatters";

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

describe("avatar profile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches avatar details with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ avatar }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAvatar("avatar-1")).resolves.toEqual({ avatar });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/avatars/avatar-1",
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

  it("formats profile metadata", () => {
    expect(formatAvatarStatus("active")).toBe("Activo");
    expect(getLiveAvatarSummary(avatar)).toEqual({
      avatarId: "demo-guide",
      selectedAvatar: "Guia cercano",
      thumbnailUrl: "https://cdn.yuni.test/demo-guide.png",
      hasVisualSnapshot: true,
      mode: "lite",
      sandbox: "Activo",
      sandboxEnabled: true,
    });
    expect(getVoiceSummary(avatar)).toEqual({
      selectedVoice: "Alloy",
      description: "Voz equilibrada y natural para conversaciones generales.",
    });
    expect(formatDateTime(avatar.createdAt)).not.toBe("Fecha no disponible");
  });

  it("falls back when provider JSON is incomplete", () => {
    const incompleteAvatar = {
      ...avatar,
      voiceConfig: {},
      liveAvatarConfig: {},
    };

    expect(getLiveAvatarSummary(incompleteAvatar).selectedAvatar).toBe("Sin avatar seleccionado");
    expect(getVoiceSummary(incompleteAvatar)).toMatchObject({
      selectedVoice: "No definido",
      description: "Sin descripción configurada.",
    });
  });

  it("does not treat thumbnail-only metadata as a complete visual snapshot", () => {
    const thumbnailOnlyAvatar = {
      ...avatar,
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: "demo-guide",
        thumbnailUrl: "https://cdn.yuni.test/demo-guide.png",
        mode: "lite",
        sandbox: true,
      },
    };

    expect(getLiveAvatarSummary(thumbnailOnlyAvatar)).toMatchObject({
      avatarId: "demo-guide",
      hasVisualSnapshot: false,
    });
  });
});
