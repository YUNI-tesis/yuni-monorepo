import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAvatar, type ApiAvatar } from "./lib/api/avatar-api";
import { AvatarContextTab } from "./components/avatar-profile/AvatarContextTab";
import { AvatarInfoTab } from "./components/avatar-profile/AvatarInfoTab";
import { AvatarProfileHeader } from "./components/avatar-profile/AvatarProfile";
import {
  avatarProfileTabs,
  getAvatarHeaderState,
  getLiveAvatarSummary,
  getVoiceSummary,
  resolveAvatarProfileTab,
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
  providerStatus: "preparing",
  hasPreviousUsableVersion: false,
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
      "/api/avatars/avatar-1",
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

  it("formats profile metadata", () => {
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
  });

  it("exposes and resolves profile tabs for deep links", () => {
    expect(avatarProfileTabs.map((tab) => tab.label)).toEqual([
      "Información",
      "Contexto",
      "Compartir",
      "Actividad",
    ]);
    expect(resolveAvatarProfileTab(null)).toBe("info");
    expect(resolveAvatarProfileTab("contexto")).toBe("contexto");
    expect(resolveAvatarProfileTab("compartir")).toBe("compartir");
    expect(resolveAvatarProfileTab("actividad")).toBe("actividad");
    expect(resolveAvatarProfileTab("unknown")).toBe("info");
  });

  it.each([
    [{ status: "disabled", providerStatus: "needs_attention" }, "Inactivo", "neutral"],
    [{ status: "draft", providerStatus: "needs_attention" }, "Borrador", "warning"],
    [{ status: "active", providerStatus: "needs_attention" }, "Revisar configuración", "danger"],
    [{ status: "active", providerStatus: "preparing" }, "Preparando cambios", "warning"],
    [{ status: "active", providerStatus: "ready" }, "Listo para usar", "success"],
  ] as const)("maps status %o to the human header state", (overrides, label, tone) => {
    expect(getAvatarHeaderState({ ...avatar, ...overrides })).toEqual({ label, tone });
  });

  it("prioritizes incomplete voice or visual configuration before sync readiness", () => {
    expect(
      getAvatarHeaderState({
        ...avatar,
        providerStatus: "ready",
        voiceConfig: {},
      })
    ).toEqual({
      label: "Configuración incompleta",
      tone: "warning",
    });

    expect(
      getAvatarHeaderState({
        ...avatar,
        providerStatus: "ready",
        liveAvatarConfig: {},
      })
    ).toEqual({
      label: "Configuración incompleta",
      tone: "warning",
    });
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

  it("renders a compact header with one title and no repeated fallback message", () => {
    const headerHtml = renderToStaticMarkup(
      createElement(AvatarProfileHeader, {
        avatar,
        visual: null,
        onBack: vi.fn(),
        onEdit: vi.fn(),
        onInteract: vi.fn(),
      })
    );

    expect(headerHtml.match(/<h1/g)).toHaveLength(1);
    expect(headerHtml).toContain("Preparando cambios");
    expect(headerHtml).not.toContain("No encontramos la vista visual");
    expect(headerHtml).not.toContain("Resumen operativo");
    expect(headerHtml).not.toContain("Sincronización");
  });

  it("keeps Information focused on personality and voice", () => {
    const infoHtml = renderToStaticMarkup(createElement(AvatarInfoTab, { avatar }));

    expect(infoHtml).toContain("Personalidad");
    expect(infoHtml).toContain("Cómo responde");
    expect(infoHtml).toContain("Responde claro.");
    expect(infoHtml).toContain("Voz");
    expect(infoHtml).toContain("Alloy");
    expect(infoHtml).not.toContain("Contexto");
    expect(infoHtml).not.toContain("Documentos");
    expect(infoHtml).not.toContain("Live Avatar");
    expect(infoHtml).not.toContain("Fechas");
    expect(infoHtml).not.toContain("Resumen operativo");
  });

  it("shows concise empty states for personality and voice", () => {
    const infoHtml = renderToStaticMarkup(
      createElement(AvatarInfoTab, {
        avatar: {
          ...avatar,
          instructions: "",
          voiceConfig: {
            displayName: "Voz sin identificador",
          },
        },
      })
    );

    expect(infoHtml).toContain("Todavía no definiste cómo debe responder.");
    expect(infoHtml).toContain("Todavía no elegiste una voz.");
    expect(infoHtml).not.toContain("Voz sin identificador");
  });

  it("keeps Context focused on helpful, non-technical language", () => {
    const contextHtml = renderToStaticMarkup(
      createElement(AvatarContextTab, {
        avatar,
        onEditContext: vi.fn(),
      })
    );

    expect(contextHtml).toContain("Contexto del avatar");
    expect(contextHtml).toContain("Documentos");
    expect(contextHtml).toContain("Todavía no agregaste documentos");
    expect(contextHtml).not.toMatch(/upload|ingestion|pipeline|storage/i);
  });
});
