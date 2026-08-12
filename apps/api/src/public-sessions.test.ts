import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { AvatarProviderError } from "@yuni/avatars";
import { createPublicSessionsController } from "./domains/public-sessions/controller";
import type { PublicSessionsControllerDependencies } from "./domains/public-sessions/controller";
import { createPublicSessionsService } from "./domains/public-sessions/service";
import { createPublicTokenService } from "./domains/public-sessions/tokens";
import { createInMemoryPublicSessionRateLimiter } from "./domains/public-sessions/rate-limiter";
import { createProviderTokenProtector } from "./domains/public-sessions/provider-token-protector";
import { verifySessionToken as verifyUserSessionToken } from "./domains/auth/session";

function createFixture(
  options: {
    disabled?: boolean;
    limited?: boolean;
    providerFails?: boolean;
    deletedLinkDuringEnd?: boolean;
    maxMessages?: number;
    expiredProviderSession?: boolean;
  } = {}
) {
  let ended = false;
  const markStarted = vi.fn(async () => ({ id: "realtime-1" }));
  const markPrepared = vi.fn(async () => ({ id: "realtime-1" }));
  const markStartFailed = vi.fn(async () => []);
  const stopSession = vi.fn(async () => undefined);
  const markProviderStopped = vi.fn(async () => ({ count: 1 }));
  const expireIfActive = vi.fn(async () => true);
  const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
  const finalize = vi.fn(async (input: { transcript: Array<{ role: string; content: string }> }) => {
    ended = true;
    finalizedTranscript.push(...input.transcript);
    return {
      session: { id: "public-session-1", status: "ended", endedAt: new Date() },
      finalized: true,
    };
  });
  const finalizedTranscript: Array<{ role: string; content: string }> = [];
  const generateTitle = vi.fn(async () => "Título generado");
  const link = {
    id: "link-1",
    slug: "demo",
    avatarAgentId: "avatar-1",
    avatarAgent: {
      id: "avatar-1",
      name: "Avatar público",
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: "live-avatar-1",
        mode: "lite",
        sandbox: true,
      },
      providerSyncStatus: "synced",
      providerAgentId: "agent-1",
    },
  };
  const dependencies = {
    repository: {
      resolveEnabledLink: vi.fn(async () => (options.disabled ? null : link)),
      findUserByEmail: vi.fn(async (email: string) =>
        email === "known@example.com" ? { id: "user-1" } : null
      ),
      createSession: vi.fn(async (input: { participantEmail: string; participantUserId?: string }) => ({
        publicSession: {
          id: "public-session-1",
          shareLinkId: "link-1",
          participantEmail: input.participantEmail,
          participantUserId: input.participantUserId ?? null,
        },
        conversation: { id: "conversation-1" },
        realtimeSession: { id: "realtime-1" },
      })),
      markStarted,
      markPrepared,
      findForStartConfirmation: vi.fn(async () => ({
        id: "public-session-1",
        shareLinkId: "link-1",
        status: "active",
        expiresAt: new Date(Date.now() + 60_000),
        shareLink: { id: "link-1", isEnabled: true },
        avatarAgent: { status: "active" },
        realtimeSessions: [{ id: "realtime-1", status: "connecting" }],
      })),
      markStartFailed,
      findForEnd: vi.fn(async () => ({
        id: "public-session-1",
        shareLinkId: options.deletedLinkDuringEnd ? null : "link-1",
        status: ended ? "ended" : "active",
        endedAt: ended ? new Date() : null,
        avatarAgent: { name: "Avatar público" },
        conversation: { id: "conversation-1" },
        realtimeSessions: [
          {
            id: "realtime-1",
            providerStoppedAt: null,
            providerSessionTokenCiphertext: "encrypted:live-token",
          },
        ],
      })),
      finalize,
      updateConversationTitleIfEnded: vi.fn(async () => ({ count: 1 })),
      markProviderStopped,
      expireIfActive,
      listExpiredForCleanup: vi.fn(async () => []),
      listExpiredForProviderStop: vi.fn(async () =>
        options.expiredProviderSession
          ? [
              {
                publicSessionId: "public-session-1",
                realtimeSessionId: "realtime-1",
                providerSessionTokenCiphertext: "encrypted:live-token",
              },
            ]
          : []
      ),
    },
    liveAvatarProvider: {
      createLiteSessionToken: vi.fn(async () => {
        if (options.providerFails) throw new AvatarProviderError("provider secret failure");
        return { sessionToken: "live-token", sessionId: "provider-session" };
      }),
      stopSession,
    },
    tokenService: {
      createIdentityToken: vi.fn(async () => ({
        token: "identity-token",
        expiresAt: new Date("2026-08-10T16:10:00.000Z"),
      })),
      verifyIdentityToken: vi.fn(async (token: string) =>
        token === "identity-token"
          ? {
              type: "public_identity" as const,
              slug: "demo",
              email: "known@example.com",
              consentedAt: "2026-08-10T16:00:00.000Z",
            }
          : null
      ),
      createSessionToken: vi.fn(async () => ({
        token: "public-session-token",
        expiresAt: new Date("2026-08-10T16:10:00.000Z"),
      })),
      verifySessionToken: vi.fn(async (token: string) =>
        token === "public-session-token"
          ? { sessionId: "public-session-1", type: "public_session" as const, shareLinkId: "link-1" }
          : null
      ),
    },
    rateLimiter: {
      consume: vi.fn(() =>
        options.limited ? ({ allowed: false, retryAfterSeconds: 60 } as const) : ({ allowed: true } as const)
      ),
    },
    publicSessionMaxMinutes: 5,
    publicSessionMaxMessages: options.maxMessages ?? 20,
    providerTokenProtector: {
      encrypt: vi.fn((token: string) => `encrypted:${token}`),
      decrypt: vi.fn((token: string) => token.replace("encrypted:", "")),
    },
    conversationTitleGenerator: { generateTitle },
    schedule: vi.fn((callback: () => void, delayMs: number) => {
      scheduled.push({ callback, delayMs });
    }),
  } as unknown as PublicSessionsControllerDependencies;
  const app = new Hono();
  app.route("/", createPublicSessionsController(dependencies));
  return {
    app,
    dependencies,
    finalizedTranscript,
    markStarted,
    markPrepared,
    markStartFailed,
    finalize,
    stopSession,
    markProviderStopped,
    expireIfActive,
    scheduled,
    generateTitle,
  };
}

describe("@yuni/api public sessions", () => {
  it("encrypts provider tokens for restart-safe cleanup", () => {
    const protector = createProviderTokenProtector("test-secret");
    const encrypted = protector.encrypt("provider-token");
    expect(encrypted).not.toContain("provider-token");
    expect(protector.decrypt(encrypted)).toBe("provider-token");
  });

  it("creates and verifies scoped identity and session tokens", async () => {
    const tokens = createPublicTokenService();
    const identity = await tokens.createIdentityToken({
      slug: "demo",
      email: "person@example.com",
      consentedAt: "2026-08-10T16:00:00.000Z",
    });
    const session = await tokens.createSessionToken("public-session-1", { shareLinkId: "link-1" }, 60);

    await expect(tokens.verifyIdentityToken(identity.token)).resolves.toMatchObject({
      type: "public_identity",
      slug: "demo",
      email: "person@example.com",
    });
    await expect(tokens.verifySessionToken(session.token)).resolves.toMatchObject({
      type: "public_session",
      sessionId: "public-session-1",
      shareLinkId: "link-1",
    });
    await expect(tokens.verifySessionToken(identity.token)).resolves.toBeNull();
    await expect(verifyUserSessionToken(session.token)).resolves.toBeNull();
  });

  it("limits attempts independently by avatar and IP/link", () => {
    let now = 0;
    const limiter = createInMemoryPublicSessionRateLimiter({
      maxPerAvatar: 3,
      maxPerIpAndLink: 1,
      windowMs: 1_000,
      now: () => now,
    });
    expect(limiter.consume({ avatarId: "avatar-1", shareLinkId: "link-1", ip: "ip-1" })).toEqual({
      allowed: true,
    });
    expect(limiter.consume({ avatarId: "avatar-1", shareLinkId: "link-1", ip: "ip-1" })).toMatchObject({
      allowed: false,
    });
    expect(limiter.consume({ avatarId: "avatar-1", shareLinkId: "link-1", ip: "ip-2" })).toEqual({
      allowed: true,
    });
    now = 1_001;
    expect(limiter.consume({ avatarId: "avatar-1", shareLinkId: "link-1", ip: "ip-1" })).toEqual({
      allowed: true,
    });
  });

  it("normalizes identity input and requires explicit consent", async () => {
    const fixture = createFixture();
    const invalid = await fixture.app.request("/public/links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "person@example.com", consent: false }),
    });
    const valid = await fixture.app.request("/public/links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "  KNOWN@EXAMPLE.COM ", consent: true }),
    });
    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({
      identity: {
        email: "known@example.com",
        token: "identity-token",
        expiresAt: "2026-08-10T16:10:00.000Z",
      },
    });
  });

  it("rejects missing or invalid public identity tokens", async () => {
    const { app } = createFixture();
    expect((await app.request("/public/links/demo/sessions", { method: "POST" })).status).toBe(401);
    expect(
      (
        await app.request("/public/links/demo/sessions", {
          method: "POST",
          headers: { Authorization: "Bearer invalid" },
        })
      ).status
    ).toBe(401);
  });

  it("creates the public call and links an existing account without exposing it", async () => {
    const fixture = createFixture();
    const response = await fixture.app.request("/public/links/demo/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer identity-token", "X-Forwarded-For": "203.0.113.1" },
    });
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      publicSession: { id: "public-session-1", token: "public-session-token" },
      voiceSession: { conversationId: "conversation-1", sessionToken: "live-token" },
    });
    expect(JSON.stringify(body)).not.toMatch(/participantUserId|known@example.com|providerAgentId|ownerId/);
    expect(fixture.markPrepared).toHaveBeenCalledOnce();
    expect(fixture.markStarted).not.toHaveBeenCalled();

    const confirmed = await fixture.app.request("/public/sessions/public-session-1/started", {
      method: "POST",
      headers: { Authorization: "Bearer public-session-token" },
    });
    expect(confirmed.status).toBe(200);
    expect(fixture.markStarted).toHaveBeenCalledOnce();
  });

  it("stops the provider session at the server deadline and cleans up after the grace period", async () => {
    const fixture = createFixture();
    const response = await fixture.app.request("/public/links/demo/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer identity-token" },
    });
    expect(response.status).toBe(201);
    expect(fixture.scheduled[0]?.delayMs).toBeGreaterThan(0);

    fixture.scheduled[0]?.callback();
    await vi.waitFor(() => expect(fixture.stopSession).toHaveBeenCalledWith("live-token"));
    await vi.waitFor(() => expect(fixture.markProviderStopped).toHaveBeenCalledWith("realtime-1"));
    await vi.waitFor(() => expect(fixture.scheduled).toHaveLength(2));
    expect(fixture.scheduled[1]?.delayMs).toBe(30_000);

    fixture.scheduled[1]?.callback();
    await vi.waitFor(() =>
      expect(fixture.expireIfActive).toHaveBeenCalledWith({
        publicSessionId: "public-session-1",
        conversationId: "conversation-1",
        realtimeSessionId: "realtime-1",
      })
    );
  });

  it("stops expired provider sessions immediately after an API restart", async () => {
    const fixture = createFixture({ expiredProviderSession: true });
    const service = createPublicSessionsService(fixture.dependencies);

    await service.cleanupExpired(new Date("2026-08-11T15:00:00.000Z"));

    expect(fixture.stopSession).toHaveBeenCalledWith("live-token");
    expect(fixture.markProviderStopped).toHaveBeenCalledWith("realtime-1");
    expect(fixture.expireIfActive).not.toHaveBeenCalled();
  });

  it("blocks session creation when the link changes state or a limit is reached", async () => {
    const disabled = createFixture({ disabled: true });
    const limited = createFixture({ limited: true });
    const headers = { Authorization: "Bearer identity-token" };
    expect(
      (await disabled.app.request("/public/links/demo/sessions", { method: "POST", headers })).status
    ).toBe(404);
    const response = await limited.app.request("/public/links/demo/sessions", { method: "POST", headers });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });

  it("marks failed starts without leaking provider details", async () => {
    const fixture = createFixture({ providerFails: true });
    const response = await fixture.app.request("/public/links/demo/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer identity-token" },
    });
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("provider secret failure");
    expect(fixture.markStartFailed).toHaveBeenCalledOnce();
  });

  it("persists safe transcript messages and ends idempotently", async () => {
    const fixture = createFixture();
    const request = () =>
      fixture.app.request("/public/sessions/public-session-1/end", {
        method: "POST",
        headers: { Authorization: "Bearer public-session-token", "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: [
            { role: "user", content: "Hola" },
            { role: "assistant", content: "Hola, ¿cómo estás?" },
          ],
        }),
      });
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect(fixture.finalizedTranscript).toHaveLength(2);
    expect(fixture.finalize).toHaveBeenCalledOnce();
    expect(fixture.generateTitle).toHaveBeenCalledOnce();
    expect(fixture.stopSession).toHaveBeenCalledWith("live-token");
    expect(fixture.markProviderStopped).toHaveBeenCalledWith("realtime-1");
  });

  it("honors a configured transcript limit without rejecting finalization", async () => {
    const fixture = createFixture({ maxMessages: 2 });
    const response = await fixture.app.request("/public/sessions/public-session-1/end", {
      method: "POST",
      headers: { Authorization: "Bearer public-session-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: [
          { role: "user", content: "Uno" },
          { role: "assistant", content: "Dos" },
          { role: "user", content: "Tres" },
        ],
      }),
    });
    expect(response.status).toBe(200);
    expect(fixture.finalizedTranscript.map(({ content }) => content)).toEqual(["Uno", "Dos"]);
  });

  it("rejects oversized, excessive, or technical public transcript data", async () => {
    const fixture = createFixture();
    const request = (transcript: unknown[]) =>
      fixture.app.request("/public/sessions/public-session-1/end", {
        method: "POST",
        headers: { Authorization: "Bearer public-session-token", "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });

    expect((await request([{ role: "user", content: "x".repeat(501) }])).status).toBe(400);
    expect(
      (await request(Array.from({ length: 21 }, () => ({ role: "user", content: "Hola" })))).status
    ).toBe(400);
    expect(
      (await request([{ role: "user", content: "Hola", metadata: { providerId: "secret" } }])).status
    ).toBe(400);
    expect(fixture.finalize).not.toHaveBeenCalled();
  });

  it("allows cleanup after the share link was deleted", async () => {
    const fixture = createFixture({ deletedLinkDuringEnd: true });
    const response = await fixture.app.request("/public/sessions/public-session-1/end", {
      method: "POST",
      headers: { Authorization: "Bearer public-session-token", "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: [] }),
    });
    expect(response.status).toBe(200);
    expect(fixture.finalize).toHaveBeenCalledOnce();
  });
});
