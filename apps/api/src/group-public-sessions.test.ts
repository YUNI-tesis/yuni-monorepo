import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createPublicGroupSessionsController } from "./domains/group-public-sessions/controller";
import {
  createPublicGroupSessionsService,
  type PublicGroupSessionsDependencies,
} from "./domains/group-public-sessions/service";
import { createPublicGroupTokenService } from "./domains/group-public-sessions/tokens";
import type { RateLimitRule } from "./domains/public-sessions/rate-limiter";

function readyGroup(overrides: Record<string, unknown> = {}) {
  const member = (id: string, position: number) => ({
    id: `member-${id}`,
    avatarAgentId: id,
    accessGrantId: null,
    position,
    avatarAgent: {
      id,
      ownerId: "owner-1",
      name: `Avatar ${id}`,
      description: "Descripción",
      status: "active",
      liveAvatarConfig: {
        provider: "liveavatar",
        avatarId: `live-${id}`,
        mode: "lite",
        sandbox: true,
      },
      voiceConfig: { provider: "elevenlabs", voiceId: `voice-${id}`, speakingRate: 1 },
      groupProviderAgentId: `group-agent-${id}`,
      groupProviderSyncStatus: "synced",
    },
  });
  return {
    id: "group-1",
    ownerId: "owner-1",
    name: "Grupo público",
    membershipVersion: 3,
    members: [member("avatar-1", 0), member("avatar-2", 1)],
    ...overrides,
  };
}

function fixture(
  options: {
    enabled?: boolean;
    link?: ReturnType<typeof linkRecord> | null;
    identityClaims?: {
      type: "public_group_identity";
      slug: string;
      email: string;
      consentedAt: string;
      scopeId: string;
      consentVersion: string;
    };
    includeDurableRateLimiter?: boolean;
    fastRateLimitResult?: { allowed: true } | { allowed: false; retryAfterSeconds: number };
    durableRateLimitResult?: { allowed: true } | { allowed: false; retryAfterSeconds: number };
  } = {}
) {
  const link = options.link === undefined ? linkRecord() : options.link;
  const resolveEnabledShareLink = vi.fn(async () => link);
  const findVoiceSessionForOwner = vi.fn(async (principalId: string, sessionId: string) =>
    principalId === "group-public:public-session-1" && sessionId === "voice-session-1"
      ? {
          id: sessionId,
          avatarGroupId: "group-1",
          status: "active",
          activatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          groupAccessGrantId: null,
          groupPublicSessionId: "public-session-1",
          participants: [],
        }
      : null
  );
  const heartbeat = vi.fn(async () => ({ count: 1 }));
  const endSession = vi.fn(async () => ({ count: 1 }));
  const rateLimiter = {
    consume: vi.fn((_rules: RateLimitRule[]) => options.fastRateLimitResult ?? ({ allowed: true } as const)),
  };
  const durableRateLimiter = {
    consume: vi.fn(
      async (_rules: RateLimitRule[]) => options.durableRateLimitResult ?? ({ allowed: true } as const)
    ),
  };
  const dependencies = {
    repository: { resolveEnabledShareLink },
    avatarGroups: {
      repository: { findVoiceSessionForOwner, heartbeat, endSession },
    },
    tokenService: {
      createIdentityToken: vi.fn(async () => ({
        token: "identity-token",
        expiresAt: new Date("2030-01-01T00:10:00.000Z"),
      })),
      verifyIdentityToken: vi.fn(async (token: string) =>
        token === "identity-token" ? (options.identityClaims ?? null) : null
      ),
      createSessionToken: vi.fn(),
      verifySessionToken: vi.fn(async (token: string) =>
        token === "runtime-token"
          ? {
              type: "public_group_session" as const,
              voiceSessionId: "voice-session-1",
              groupPublicSessionId: "public-session-1",
            }
          : token === "cross-token"
            ? {
                type: "public_group_session" as const,
                voiceSessionId: "another-voice-session",
                groupPublicSessionId: "public-session-2",
              }
            : null
      ),
    },
    rateLimiter,
    ...(options.includeDurableRateLimiter === false ? {} : { durableRateLimiter }),
    enabled: () => options.enabled ?? true,
    rateLimits: {
      identifyIpLink: 10,
      identifyEmailLink: 10,
      startIpTarget: 10,
      startParticipantTarget: 10,
      startLink: 10,
      startAvatar: 10,
      runtimeSession: 20,
      runtimeSessionIp: 10,
      endSession: 5,
      endSessionIp: 10,
    },
  } as unknown as PublicGroupSessionsDependencies;
  const app = new Hono();
  app.route("/", createPublicGroupSessionsController(dependencies));
  return {
    app,
    resolveEnabledShareLink,
    findVoiceSessionForOwner,
    heartbeat,
    endSession,
    rateLimiter,
    durableRateLimiter,
  };
}

function linkRecord(group = readyGroup()) {
  return {
    id: "link-1",
    slug: "demo",
    avatarGroupId: "group-1",
    avatarGroup: group,
  };
}

function identifyBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    email: " PERSON@EXAMPLE.COM ",
    consent: true,
    scopeId: "group-share-link:link-1",
    consentVersion: "3",
    ...overrides,
  });
}

describe("@yuni/api public group sessions", () => {
  it("ends a prepared reservation when runtime token issuance fails", async () => {
    const group = readyGroup();
    const participants = group.members.map((member) => ({
      id: `participant-${member.avatarAgentId}`,
      avatarAgentId: member.avatarAgentId,
      realtimeSessionId: null,
      status: "connecting",
      avatarAgent: {
        ...member.avatarAgent,
        instructions: "Respondé con precisión.",
        context: "Contexto",
        groupProviderSyncFingerprint: "fingerprint",
        providerContextDocumentId: null,
        providerContextSyncStatus: "synced",
        documents: [],
      },
      realtimeSession: null,
    }));
    const detailedSession = {
      id: "voice-session-1",
      avatarGroupId: group.id,
      conversationId: "conversation-1",
      status: "connecting",
      activatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      groupAccessGrantId: null,
      groupPublicSessionId: "public-session-1",
      participants,
    };
    const endSession = vi.fn(async () => detailedSession);
    const dependencies = {
      repository: { resolveEnabledShareLink: vi.fn(async () => linkRecord(group)) },
      avatarGroups: {
        repository: {
          createPublicVoiceSession: vi.fn(async () => ({
            publicSession: {
              id: "public-session-1",
              expiresAt: detailedSession.expiresAt,
            },
            voiceSession: {
              id: detailedSession.id,
              conversationId: detailedSession.conversationId,
              expiresAt: detailedSession.expiresAt,
            },
          })),
          findVoiceSessionForOwner: vi.fn(async () => detailedSession),
          createRealtimeParticipant: vi.fn(async (participantId: string) => ({
            realtimeSessionId: `realtime-${participantId}`,
          })),
          activateParticipantConnection: vi.fn(async () => true),
          endSession,
        },
        messagesRepository: {},
        liveAvatarProvider: {
          createLiteSessionToken: vi.fn(async ({ avatarId }: { avatarId: string }) => ({
            sessionId: `live-session-${avatarId}`,
            sessionToken: `live-token-${avatarId}`,
          })),
          stopSession: vi.fn(async () => undefined),
        },
        elevenLabsAgentProvider: {},
        orchestrator: {},
        providerTokenProtector: { encrypt: (token: string) => `encrypted:${token}` },
      },
      tokenService: {
        verifyIdentityToken: vi.fn(async () => ({
          type: "public_group_identity",
          slug: "demo",
          email: "person@example.com",
          consentedAt: new Date().toISOString(),
          scopeId: "group-share-link:link-1",
          consentVersion: "3",
        })),
        createSessionToken: vi.fn(async () => {
          throw new Error("signing unavailable");
        }),
      },
      rateLimiter: { consume: vi.fn(() => ({ allowed: true })) },
      enabled: () => true,
      rateLimits: {
        identifyIpLink: 10,
        identifyEmailLink: 10,
        startIpTarget: 10,
        startParticipantTarget: 10,
        startLink: 10,
        startAvatar: 10,
        runtimeSession: 20,
        runtimeSessionIp: 10,
        endSession: 5,
        endSessionIp: 10,
      },
    } as unknown as PublicGroupSessionsDependencies;

    await expect(
      createPublicGroupSessionsService(dependencies).start("demo", "identity-token", "127.0.0.1")
    ).rejects.toThrow("signing unavailable");

    expect(endSession).toHaveBeenCalledWith("group-public:public-session-1", "voice-session-1");
  });

  it("applies all identify rules through the durable limiter and returns its retryAfter", async () => {
    const { app, rateLimiter, durableRateLimiter } = fixture({
      durableRateLimitResult: { allowed: false, retryAfterSeconds: 37 },
    });
    const response = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody(),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(await response.json()).toMatchObject({
      error: { reason: "PLATFORM_RATE_LIMIT", retryAfterSeconds: 37 },
    });
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(durableRateLimiter.consume).toHaveBeenCalledTimes(1);
    expect(durableRateLimiter.consume).toHaveBeenCalledWith([
      expect.objectContaining({ namespace: "group-public-identify-ip-link" }),
      expect.objectContaining({ namespace: "group-public-identify-email-link" }),
    ]);
  });

  it("uses the in-memory limiter only when the durable dependency is absent", async () => {
    const { app, durableRateLimiter } = fixture({
      includeDurableRateLimiter: false,
      fastRateLimitResult: { allowed: false, retryAfterSeconds: 11 },
    });
    const response = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody(),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("11");
    expect(durableRateLimiter.consume).not.toHaveBeenCalled();
  });

  it("requires explicit, current consent before issuing an identity", async () => {
    const { app } = fixture();
    const missingConsent = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "person@example.com", consentVersion: "3" }),
    });
    const falseConsent = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody({ consent: false }),
    });
    const missingScope = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody({ scopeId: undefined }),
    });
    const stale = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody({ consentVersion: "2" }),
    });
    const wrongScope = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody({ scopeId: "group-share-link:another-link" }),
    });
    const valid = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody(),
    });

    expect(missingConsent.status).toBe(400);
    expect(falseConsent.status).toBe(400);
    expect(missingScope.status).toBe(400);
    expect(stale.status).toBe(409);
    expect(wrongScope.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { reason: "CONSENT_VERSION_STALE" } });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({
      identity: {
        email: "person@example.com",
        scopeId: "group-share-link:link-1",
        consentVersion: "3",
      },
    });
  });

  it("rate-limits starts before returning stale-consent errors", async () => {
    const { app, durableRateLimiter } = fixture({
      identityClaims: {
        type: "public_group_identity",
        slug: "demo",
        email: "person@example.com",
        consentedAt: new Date().toISOString(),
        scopeId: "group-share-link:link-1",
        consentVersion: "2",
      },
      durableRateLimitResult: { allowed: false, retryAfterSeconds: 23 },
    });

    const response = await app.request("/public/group-links/demo/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer identity-token" },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(durableRateLimiter.consume).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ namespace: "group-public-start-ip-target" }),
        expect.objectContaining({ namespace: "group-public-start-link" }),
      ])
    );
  });

  it("rate-limits starts before returning readiness errors", async () => {
    const unavailable = readyGroup();
    unavailable.members[0]!.avatarAgent.groupProviderSyncStatus = "syncing";
    const { app, durableRateLimiter } = fixture({
      link: linkRecord(unavailable),
      identityClaims: {
        type: "public_group_identity",
        slug: "demo",
        email: "person@example.com",
        consentedAt: new Date().toISOString(),
        scopeId: "group-share-link:link-1",
        consentVersion: "3",
      },
      durableRateLimitResult: { allowed: false, retryAfterSeconds: 23 },
    });

    const response = await app.request("/public/group-links/demo/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer identity-token" },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("23");
    expect(durableRateLimiter.consume).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ namespace: "group-public-start-ip-target" }),
        expect.objectContaining({ namespace: "group-public-start-link" }),
      ])
    );
  });

  it("returns the same 404 for a missing link and an ineligible live roster", async () => {
    const missing = fixture({ link: null });
    const mixed = readyGroup();
    mixed.members[1]!.avatarAgent.ownerId = "another-owner";
    const ineligible = fixture({ link: linkRecord(mixed) });
    const request = (app: Hono) =>
      app.request("/public/group-links/demo/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: identifyBody(),
      });

    const [missingResponse, ineligibleResponse] = await Promise.all([
      request(missing.app),
      request(ineligible.app),
    ]);
    expect(missingResponse.status).toBe(404);
    expect(ineligibleResponse.status).toBe(404);
    expect(await missingResponse.json()).toEqual(await ineligibleResponse.json());
  });

  it("keeps issued runtime commands alive when new public starts are feature-disabled", async () => {
    const { app, heartbeat } = fixture({ enabled: false });
    const identify = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody(),
    });
    const runtime = await app.request("/public/group-voice-sessions/voice-session-1/heartbeat", {
      method: "POST",
      headers: { Authorization: "Bearer runtime-token" },
    });

    expect(identify.status).toBe(503);
    expect(runtime.status).toBe(200);
    expect(heartbeat).toHaveBeenCalledWith("group-public:public-session-1", "voice-session-1");
  });

  it("rejects a valid token issued for another group voice session", async () => {
    const { app, findVoiceSessionForOwner } = fixture();
    const response = await app.request("/public/group-voice-sessions/voice-session-1/heartbeat", {
      method: "POST",
      headers: { Authorization: "Bearer cross-token" },
    });

    expect(response.status).toBe(401);
    expect(findVoiceSessionForOwner).not.toHaveBeenCalled();
  });

  it("uses an isolated runtime bucket and a separate end bucket", async () => {
    const { app, durableRateLimiter, rateLimiter } = fixture();
    const heartbeatResponse = await app.request("/public/group-voice-sessions/voice-session-1/heartbeat", {
      method: "POST",
      headers: { Authorization: "Bearer runtime-token" },
    });
    const endResponse = await app.request("/public/group-voice-sessions/voice-session-1/end", {
      method: "POST",
      headers: { Authorization: "Bearer runtime-token", "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "user" }),
    });

    expect(heartbeatResponse.status).toBe(200);
    expect(endResponse.status).toBe(200);
    expect(durableRateLimiter.consume).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        namespace: "group-public-runtime-session",
        identifiers: ["voice-session-1"],
        limit: 20,
      }),
      expect.objectContaining({
        namespace: "group-public-runtime-session-ip",
        identifiers: ["voice-session-1", "unknown"],
        limit: 10,
      }),
    ]);
    expect(durableRateLimiter.consume).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        namespace: "group-public-runtime-end-session",
        identifiers: ["voice-session-1"],
        limit: 5,
      }),
      expect.objectContaining({
        namespace: "group-public-runtime-end-session-ip",
        identifiers: ["voice-session-1", "unknown"],
        limit: 10,
      }),
    ]);
    expect(rateLimiter.consume).not.toHaveBeenCalled();
  });

  it("durably rate-limits every non-terminal runtime command by session and session plus IP", async () => {
    const { app, durableRateLimiter, rateLimiter } = fixture({
      durableRateLimitResult: { allowed: false, retryAfterSeconds: 17 },
    });
    const commands: Array<{ path: string; body?: Record<string, unknown> }> = [
      { path: "/public/group-voice-sessions/voice-session-1/scribe-token" },
      {
        path: "/public/group-voice-sessions/voice-session-1/turns",
        body: { sourceEventId: "scribe-1", content: "Hola" },
      },
      {
        path: "/public/group-voice-sessions/voice-session-1/provider-events",
        body: {
          sourceEventId: "provider-1",
          turnId: null,
          avatarId: "avatar-1",
          type: "speak_started",
        },
      },
      {
        path: "/public/group-voice-sessions/voice-session-1/interrupt",
        body: { reason: "user" },
      },
      { path: "/public/group-voice-sessions/voice-session-1/participants/avatar-1/retry" },
      {
        path: "/public/group-voice-sessions/voice-session-1/participants/avatar-1/started",
        body: { participantAttemptId: "attempt-1" },
      },
      {
        path: "/public/group-voice-sessions/voice-session-1/participants/avatar-1/failure",
        body: {
          sourceEventId: "failure-1",
          reason: "stream_error",
          participantAttemptId: "attempt-1",
        },
      },
      { path: "/public/group-voice-sessions/voice-session-1/heartbeat" },
    ];

    for (const command of commands) {
      const response = await app.request(command.path, {
        method: "POST",
        headers: {
          Authorization: "Bearer runtime-token",
          ...(command.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(command.body ? { body: JSON.stringify(command.body) } : {}),
      });

      expect(response.status, command.path).toBe(429);
      expect(response.headers.get("Retry-After"), command.path).toBe("17");
    }

    expect(durableRateLimiter.consume).toHaveBeenCalledTimes(commands.length);
    for (const [rules] of durableRateLimiter.consume.mock.calls) {
      expect(rules).toEqual([
        expect.objectContaining({
          namespace: "group-public-runtime-session",
          identifiers: ["voice-session-1"],
          limit: 20,
        }),
        expect.objectContaining({
          namespace: "group-public-runtime-session-ip",
          identifiers: ["voice-session-1", "unknown"],
          limit: 10,
        }),
      ]);
    }
    expect(rateLimiter.consume).not.toHaveBeenCalled();
  });

  it("rejects oversized identify payloads before resolving the link", async () => {
    const { app, resolveEnabledShareLink } = fixture();
    const response = await app.request("/public/group-links/demo/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: identifyBody({ email: `${"a".repeat(17_000)}@example.com` }),
    });

    expect(response.status).toBe(413);
    expect(resolveEnabledShareLink).not.toHaveBeenCalled();
  });

  it("cryptographically separates group identity and runtime tokens", async () => {
    const tokens = createPublicGroupTokenService();
    const identity = await tokens.createIdentityToken({
      slug: "demo",
      email: "person@example.com",
      consentedAt: new Date().toISOString(),
      scopeId: "group-share-link:link-1",
      consentVersion: "3",
    });
    const runtime = await tokens.createSessionToken(
      "voice-session-1",
      { groupPublicSessionId: "public-session-1" },
      60
    );

    await expect(tokens.verifySessionToken(identity.token)).resolves.toBeNull();
    await expect(tokens.verifyIdentityToken(runtime.token)).resolves.toBeNull();
    await expect(tokens.verifySessionToken(runtime.token)).resolves.toMatchObject({
      voiceSessionId: "voice-session-1",
      groupPublicSessionId: "public-session-1",
    });
  });
});
