import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createAccessGrant,
  createShareLink,
  confirmPublicSessionStarted,
  deleteAccessGrant,
  deleteShareLink,
  getPublicSharedAvatar,
  identifyPublicVisitor,
  startPublicSession,
  endPublicSession,
  failPublicSessionStart,
  normalizePublicTranscript,
  listAccessGrants,
  listShareLinks,
  updateAccessGrant,
  updateShareLink,
} from "./lib/api/sharing-api";
import {
  canOpenPublicLink,
  emptyInteractionLimitsDraft,
  formatInteractionLimitsSummary,
  hasConfiguredInteractionLimits,
  getAccessGrantCreateError,
  getAccessGrantPresentation,
  normalizeGrantEmail,
  parseInteractionLimitsDraft,
  requiresRenewedPublicConsent,
  toPublicSlug,
  validateGrantEmail,
  validateShareLinkDraft,
} from "./lib/avatar-sharing";
import { ApiClientError, queueApiJsonBeacon } from "./lib/api/http-client";
import {
  KEEPALIVE_MAX_BODY_BYTES,
  normalizeVoiceTranscript,
  transcriptRequestBodyByteLength,
} from "./lib/api/transcript";
import { endVoiceSession } from "./lib/api/avatar-api";
import { getAvatarCardActionMode } from "./lib/avatar-dashboard";
import { readSessionValue, removeSessionValue, storeSessionValue } from "./lib/browser-storage";
import { InteractionLimitsFields } from "./components/avatar-profile/InteractionLimitsFields";
import { formatPublicCountdown, formatPublicSessionStartError } from "./app/a/[slug]/PublicAvatarView";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sharing UI helpers", () => {
  it("treats unavailable session storage as a non-blocking browser preference", () => {
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("blocked");
      },
    });

    expect(readSessionValue("identity")).toBeNull();
    expect(storeSessionValue("identity", "value")).toBe(false);
    expect(removeSessionValue("identity")).toBe(false);
  });

  it("queues teardown JSON through a CORS-safe beacon payload", () => {
    const sendBeacon = vi.fn(() => true);

    expect(
      queueApiJsonBeacon(
        "/voice-sessions/realtime-1/end",
        { transcript: [{ role: "user", content: "Hola" }] },
        sendBeacon
      )
    ).toBe(true);
    expect(sendBeacon).toHaveBeenCalledWith(
      expect.stringContaining("/voice-sessions/realtime-1/end"),
      JSON.stringify({ transcript: [{ role: "user", content: "Hola" }] })
    );
  });

  it.each([
    ["Asistente de Álgebra", "asistente-de-algebra"],
    ["  Demo & Prueba  ", "demo-prueba"],
    ["A", "a-avatar"],
    ["---", "avatar"],
  ])("creates a valid editable slug from %s", (name, expected) => {
    expect(toPublicSlug(name)).toBe(expected);
  });

  it("keeps generated slugs inside the API limit", () => {
    const slug = toPublicSlug("Avatar ".repeat(30));

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("validates link and grant drafts without changing their values", () => {
    expect(validateShareLinkDraft("", "Invalid slug")).toEqual({
      name: "Escribí un nombre para reconocer el link.",
      slug: "Usá entre 3 y 80 caracteres: minúsculas, números y guiones.",
    });
    expect(validateShareLinkDraft("Demo", "demo-link")).toEqual({
      name: null,
      slug: null,
    });
    expect(normalizeGrantEmail("  USER@EXAMPLE.COM ")).toBe("user@example.com");
    expect(validateGrantEmail("user@example.com")).toBeNull();
    expect(validateGrantEmail("invalid")).toBe("Ingresá un email válido.");
  });

  it("maps grant states and shared card capabilities", () => {
    expect(getAccessGrantPresentation("pending")).toMatchObject({
      label: "Cuenta pendiente",
      tone: "warning",
    });
    expect(getAccessGrantPresentation("linked")).toMatchObject({
      label: "Cuenta vinculada",
      tone: "success",
    });
    expect(getAccessGrantPresentation("revoked")).toMatchObject({
      label: "Acceso revocado",
      tone: "danger",
    });
    expect(getAvatarCardActionMode("owner")).toBe("owner-actions");
    expect(getAvatarCardActionMode("shared")).toBe("shared-actions");
  });

  it("presents a friendly error when the owner grants access to themselves", () => {
    expect(
      getAccessGrantCreateError(
        new ApiClientError(
          "Owners cannot grant access to themselves",
          400,
          "BAD_REQUEST",
          "SELF_ACCESS_GRANT"
        )
      )
    ).toBe("No necesitás darte acceso: ya sos el propietario de este avatar.");
  });

  it("only enables public preview when link and avatar are active", () => {
    expect(canOpenPublicLink({ isEnabled: true }, "active")).toBe(true);
    expect(canOpenPublicLink({ isEnabled: false }, "active")).toBe(false);
    expect(canOpenPublicLink({ isEnabled: true }, "draft")).toBe(false);
  });

  it("requires fresh consent before another call after the public identity expires", () => {
    expect(requiresRenewedPublicConsent(true, false, false)).toBe(true);
    expect(requiresRenewedPublicConsent(false, true, false)).toBe(true);
    expect(requiresRenewedPublicConsent(true, false, true)).toBe(false);
    expect(requiresRenewedPublicConsent(false, false, false)).toBe(false);
  });

  it("parses, validates and summarizes optional interaction limits", () => {
    expect(parseInteractionLimitsDraft(emptyInteractionLimitsDraft)).toMatchObject({
      isValid: true,
      limits: {
        maxSessionDurationSeconds: null,
        maxSessionsPer24Hours: null,
      },
    });
    expect(formatInteractionLimitsSummary(null)).toBe("Ilimitado");
    expect(
      hasConfiguredInteractionLimits({
        maxSessionDurationSeconds: null,
        maxSessionsPer24Hours: null,
      })
    ).toBe(false);
    expect(
      hasConfiguredInteractionLimits({
        maxSessionDurationSeconds: 45,
        maxSessionsPer24Hours: null,
      })
    ).toBe(true);
    expect(
      formatInteractionLimitsSummary({
        maxSessionDurationSeconds: 600,
        maxSessionsPer24Hours: 3,
      })
    ).toBe("10 min por llamada · 3 llamadas cada 24 h");
    expect(
      formatInteractionLimitsSummary({ maxSessionDurationSeconds: 45, maxSessionsPer24Hours: null })
    ).toBe("45 s por llamada");
    expect(
      parseInteractionLimitsDraft({
        sessionDuration: "30",
        sessionDurationUnit: "seconds",
        maxSessionsPer24Hours: "101",
      })
    ).toMatchObject({ isValid: false });
  });

  it("renders all optional limit inputs with unlimited placeholders", () => {
    const html = renderToStaticMarkup(
      createElement(InteractionLimitsFields, {
        draft: emptyInteractionLimitsDraft,
        errors: {
          sessionDuration: null,
          sessionDurationUnit: null,
          maxSessionsPer24Hours: null,
        },
        onChange: vi.fn(),
      })
    );
    expect(html).toContain("Límites de uso (opcional)");
    expect(html.match(/placeholder="Ilimitado"/g)).toHaveLength(2);
    expect(html.match(/type="text"/g)).toHaveLength(2);
    expect(html.match(/inputMode="numeric"/g)).toHaveLength(2);
    expect(html).not.toContain('type="number"');
    expect(html).toContain("Duración por llamada");
    expect(html).toContain("Minutos");
    expect(html).toContain('aria-label="Unidad de duración"');
    expect(html).toContain("Llamadas cada 24 h");
    expect(html).not.toContain("Minutos cada 24 h");
  });

  it("formats public countdown and quota errors with retry time", () => {
    expect(formatPublicCountdown(61)).toBe("1:01");
    expect(
      formatPublicSessionStartError(
        new ApiClientError("limited", 429, "RATE_LIMITED", "SHARE_SESSION_COUNT_LIMIT", 3600),
        () => "fallback"
      )
    ).toBe("Ya alcanzaste la cantidad de llamadas permitidas.");
    expect(
      formatPublicSessionStartError(new ApiClientError("Unauthorized", 401, "UNAUTHORIZED"), () => "fallback")
    ).toBe("Tu identificación venció. Volvé a aceptar el aviso de privacidad para continuar.");
  });
});

describe("sharing API client", () => {
  it("calls every private sharing endpoint with the expected method and payload", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, shareLinks: [], accessGrants: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await listShareLinks("avatar-1");
    await createShareLink("avatar-1", { slug: "demo-link", name: "Demo", isEnabled: true });
    await updateShareLink("avatar-1", "link-1", { isEnabled: false });
    await deleteShareLink("avatar-1", "link-1");
    await listAccessGrants("avatar-1");
    await createAccessGrant("avatar-1", "user@example.com", {
      maxSessionDurationSeconds: 45,
      maxSessionsPer24Hours: 2,
    });
    await updateAccessGrant("avatar-1", "grant-1", { status: "revoked" });
    await updateAccessGrant("avatar-1", "grant-1", {
      limits: {
        maxSessionDurationSeconds: null,
        maxSessionsPer24Hours: 5,
      },
    });
    await deleteAccessGrant("avatar-1", "grant-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["/api/avatars/avatar-1/share-links", "GET"],
      ["/api/avatars/avatar-1/share-links", "POST"],
      ["/api/avatars/avatar-1/share-links/link-1", "PATCH"],
      ["/api/avatars/avatar-1/share-links/link-1", "DELETE"],
      ["/api/avatars/avatar-1/access-grants", "GET"],
      ["/api/avatars/avatar-1/access-grants", "POST"],
      ["/api/avatars/avatar-1/access-grants/grant-1", "PATCH"],
      ["/api/avatars/avatar-1/access-grants/grant-1", "PATCH"],
      ["/api/avatars/avatar-1/access-grants/grant-1", "DELETE"],
    ]);
    expect(fetchMock.mock.calls[1]?.[1].body).toBe(
      JSON.stringify({ slug: "demo-link", name: "Demo", isEnabled: true })
    );
    expect(fetchMock.mock.calls[5]?.[1].body).toBe(
      JSON.stringify({
        email: "user@example.com",
        limits: { maxSessionDurationSeconds: 45, maxSessionsPer24Hours: 2 },
      })
    );
    expect(fetchMock.mock.calls[6]?.[1].body).toBe(JSON.stringify({ status: "revoked" }));
    expect(fetchMock.mock.calls[7]?.[1].body).toBe(
      JSON.stringify({ limits: { maxSessionDurationSeconds: null, maxSessionsPer24Hours: 5 } })
    );
  });

  it("resolves encoded public slugs and exposes conflict errors to the form", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareLink: { slug: "demo-link", name: "Demo" },
            avatar: { name: "Avatar", description: "", thumbnailUrl: null },
            capabilities: { voice: "ready" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Share link slug already exists" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicSharedAvatar("demo link")).resolves.toMatchObject({
      shareLink: { slug: "demo-link" },
    });
    await expect(createShareLink("avatar-1", { slug: "demo-link", name: "Demo" })).rejects.toMatchObject({
      status: 409,
      message: "Share link slug already exists",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/public/links/demo%20link/avatar");
  });

  it("uses bearer tokens and safe payloads for the complete public session flow", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ identity: {}, publicSession: {}, voiceSession: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await identifyPublicVisitor("demo link", "person@example.com");
    await startPublicSession("demo link", "identity-token");
    await confirmPublicSessionStarted("session-1", "session-token");
    await failPublicSessionStart("session-1", "session-token", { keepalive: true });
    await endPublicSession("session-1", "session-token", [{ role: "user", content: "Hola" }], {
      keepalive: true,
    });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ["/api/public/links/demo%20link/identify", "POST"],
      ["/api/public/links/demo%20link/sessions", "POST"],
      ["/api/public/sessions/session-1/started", "POST"],
      ["/api/public/sessions/session-1/start-failed", "POST"],
      ["/api/public/sessions/session-1/end", "POST"],
    ]);
    expect(fetchMock.mock.calls[0]?.[1].body).toBe(
      JSON.stringify({ email: "person@example.com", consent: true })
    );
    expect(fetchMock.mock.calls[1]?.[1].headers).toMatchObject({
      Authorization: "Bearer identity-token",
    });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer session-token" },
      keepalive: true,
    });
    expect(fetchMock.mock.calls[2]?.[1].headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
    expect(fetchMock.mock.calls[4]?.[1].headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
    expect(fetchMock.mock.calls[4]?.[1].keepalive).toBe(true);
  });

  it("bounds public transcripts and removes technical metadata before sending", () => {
    const transcript = normalizePublicTranscript([
      { role: "user", content: `  ${"x".repeat(1200)}  `, metadata: { providerId: "secret" } },
      ...Array.from({ length: 205 }, () => ({ role: "assistant" as const, content: "Respuesta" })),
    ]);

    expect(transcript).toHaveLength(200);
    expect(transcript[0]?.content).toHaveLength(1000);
    expect(JSON.stringify(transcript)).not.toContain("metadata");
    expect(JSON.stringify(transcript)).not.toContain("providerId");
    expect(normalizePublicTranscript(transcript, 3)).toHaveLength(3);
  });

  it("keeps multibyte transcripts inside the shared 256 KiB request budget", () => {
    const transcript = normalizeVoiceTranscript(
      Array.from({ length: 205 }, () => ({
        role: "assistant" as const,
        content: "🙂".repeat(600),
        metadata: { providerId: "secret" },
      }))
    );

    expect(transcript.length).toBeLessThanOrEqual(200);
    expect(transcript.every((entry) => entry.content.length <= 1000)).toBe(true);
    expect(transcriptRequestBodyByteLength(transcript)).toBeLessThanOrEqual(256 * 1024);
    expect(JSON.stringify(transcript)).not.toContain("metadata");
  });

  it("keeps unload transcripts below the browser keepalive budget", () => {
    const transcript = normalizePublicTranscript(
      Array.from({ length: 200 }, () => ({
        role: "assistant" as const,
        content: "🙂".repeat(600),
      })),
      200,
      KEEPALIVE_MAX_BODY_BYTES
    );

    expect(transcriptRequestBodyByteLength(transcript)).toBeLessThanOrEqual(KEEPALIVE_MAX_BODY_BYTES);
  });

  it("applies the keepalive budget automatically to public session closes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ publicSession: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await endPublicSession(
      "session-1",
      "session-token",
      Array.from({ length: 200 }, () => ({
        role: "assistant" as const,
        content: "🙂".repeat(600),
      })),
      { keepalive: true }
    );

    const body = String(fetchMock.mock.calls[0]?.[1].body);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(KEEPALIVE_MAX_BODY_BYTES);
  });

  it("uses the common transcript normalizer for private and shared session closes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ voiceSession: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await endVoiceSession("realtime-1", [
      { role: "user", content: `  ${"x".repeat(1200)}  `, metadata: { providerId: "secret" } },
      { role: "assistant", content: "   " },
    ]);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1].body));
    expect(body).toEqual({ transcript: [{ role: "user", content: "x".repeat(1000) }] });
  });

  it("uses keepalive and its browser-safe budget for authenticated session closes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ voiceSession: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await endVoiceSession(
      "realtime-1",
      Array.from({ length: 200 }, () => ({
        role: "assistant" as const,
        content: "🙂".repeat(600),
      })),
      { keepalive: true }
    );

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request.keepalive).toBe(true);
    expect(new TextEncoder().encode(String(request.body)).byteLength).toBeLessThanOrEqual(
      KEEPALIVE_MAX_BODY_BYTES
    );
  });
});
