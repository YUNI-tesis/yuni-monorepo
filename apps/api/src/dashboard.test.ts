import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createCreatorSessionMiddleware, type CreatorSessionEnv } from "./domains/auth/middleware";
import { createSessionToken, SESSION_COOKIE_NAME } from "./domains/auth/session";
import { createParticipantKey } from "./utils/participant-key";
import { createCreatorDashboardController } from "./domains/dashboard/controller";
import type { CreatorDashboardRepository, CreatorDashboardSummaryData } from "./domains/dashboard/repository";
import { createCreatorDashboardService, getDashboardRanges } from "./domains/dashboard/service";

const now = new Date("2026-08-16T15:00:00.000Z");

function createSummaryData(): CreatorDashboardSummaryData {
  return {
    avatars: [
      {
        id: "avatar-1",
        name: "Álgebra",
        status: "active",
        providerAgentId: null,
        providerSyncStatus: "failed",
        providerLastUsableAt: null,
      },
      {
        id: "avatar-2",
        name: "Historia",
        status: "active",
        providerAgentId: "provider-2",
        providerSyncStatus: "synced",
        providerLastUsableAt: null,
      },
    ],
    activityBuckets: [
      activity("old-conversation", "avatar-1", "person@example.com", "access_grant", "text", "2026-08-01", 3),
      activity(
        "public-conversation",
        "avatar-1",
        "person@example.com",
        "public_link",
        "text",
        "2026-08-10",
        2
      ),
      activity(
        "voice-no-transcript",
        "avatar-2",
        "other@example.com",
        "access_grant",
        "voice",
        "2026-08-15",
        0
      ),
      activity("previous", "avatar-2", "previous@example.com", "access_grant", "text", "2026-07-10", 2),
    ],
    grants: [
      grant("grant-unused", "avatar-1", "unused@example.com", "active", "2026-07-01T10:00:00.000Z"),
      grant(
        "grant-inactive",
        "avatar-1",
        "inactive@example.com",
        "active",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        "2026-07-20T10:00:00.000Z"
      ),
      grant(
        "grant-activated",
        "avatar-2",
        "other@example.com",
        "active",
        "2026-07-25T10:00:00.000Z",
        "2026-07-29T10:00:00.000Z",
        "2026-08-15T10:00:00.000Z"
      ),
      grant(
        "grant-revoked",
        "avatar-2",
        "late@example.com",
        "revoked",
        "2026-07-27T10:00:00.000Z",
        "2026-08-05T10:00:00.000Z",
        "2026-08-05T10:00:00.000Z"
      ),
      grant(
        "grant-previous",
        "avatar-2",
        "previous@example.com",
        "revoked",
        "2026-06-20T10:00:00.000Z",
        "2026-06-21T10:00:00.000Z",
        "2026-07-10T10:00:00.000Z"
      ),
    ],
    voiceSessions: [
      voiceSession(
        "voice-ended",
        "ended",
        "2026-08-01T10:00:00.000Z",
        "2026-08-01T10:00:00.000Z",
        "2026-08-01T10:05:00.000Z"
      ),
      voiceSession(
        "voice-error",
        "errored",
        "2026-08-10T10:00:00.000Z",
        undefined,
        "2026-08-10T10:00:02.000Z"
      ),
      voiceSession("voice-connecting", "connecting", "2026-08-11T10:00:00.000Z"),
    ],
    interruptedConversations: [
      {
        sessionId: "voice-error",
        conversationId: "public-conversation",
        avatarAgentId: "avatar-1",
        participantEmail: "person@example.com",
        participantName: "Persona",
        startedAt: new Date("2026-08-10T10:00:00.000Z"),
        totalCount: 1,
      },
    ],
    avatarLastActivity: [
      { avatarAgentId: "avatar-1", lastActivityAt: new Date("2026-08-10T10:00:00.000Z") },
      { avatarAgentId: "avatar-2", lastActivityAt: new Date("2026-08-15T10:00:00.000Z") },
    ],
  };
}

function activity(
  conversationId: string,
  avatarAgentId: string,
  participantEmail: string,
  origin: "access_grant" | "public_link",
  mode: "text" | "voice",
  activityDate: string,
  participantTurns: number
): CreatorDashboardSummaryData["activityBuckets"][number] {
  return {
    conversationId,
    avatarAgentId,
    participantEmail,
    participantName: participantEmail === "person@example.com" ? "Persona" : null,
    origin,
    mode,
    status: "ended",
    title: `Conversación ${conversationId}`,
    activityDate,
    lastActivityAt: new Date(`${activityDate}T12:00:00.000Z`),
    participantTurns,
  };
}

function grant(
  id: string,
  avatarAgentId: string,
  participantEmail: string,
  status: "active" | "revoked",
  createdAt: string,
  firstDirectActivityAt?: string,
  latestParticipantActivityAt?: string
): CreatorDashboardSummaryData["grants"][number] {
  return {
    id,
    avatarAgentId,
    participantEmail,
    participantName: null,
    status,
    createdAt: new Date(createdAt),
    firstDirectActivityAt: firstDirectActivityAt ? new Date(firstDirectActivityAt) : null,
    latestParticipantActivityAt: latestParticipantActivityAt ? new Date(latestParticipantActivityAt) : null,
  };
}

function voiceSession(
  id: string,
  status: "connecting" | "active" | "ended" | "errored",
  startedAt: string,
  activatedAt?: string,
  endedAt?: string
): CreatorDashboardSummaryData["voiceSessions"][number] {
  return {
    id,
    conversationId: `conversation-${id}`,
    avatarAgentId: "avatar-1",
    status,
    startedAt: new Date(startedAt),
    activatedAt: activatedAt ? new Date(activatedAt) : null,
    endedAt: endedAt ? new Date(endedAt) : null,
  };
}

function createRepository(data = createSummaryData()): CreatorDashboardRepository {
  return { getSummaryData: vi.fn().mockResolvedValue(data) };
}

describe("@yuni/api creator dashboard service", () => {
  it("uses objective events, deduplicates origins and reconciles avatar metrics", async () => {
    const service = createCreatorDashboardService({ repository: createRepository(), now: () => now });
    const summary = await service.getSummary("owner-1", {
      days: 30,
      timeZone: "America/Argentina/Buenos_Aires",
    });

    expect(summary.overview.activeParticipants).toEqual({ value: 2, previous: 1, changePercent: 100 });
    expect(summary.overview.engagedConversations).toEqual({ value: 3, previous: 1, changePercent: 200 });
    expect(summary.overview.returningParticipants).toMatchObject({ value: 1, total: 2, rate: 50 });
    expect(summary.overview.directAccessActivation).toMatchObject({ value: 1, total: 2, rate: 50 });
    expect(summary.byOrigin.find((row) => row.origin === "all")).toMatchObject({ activeParticipants: 2 });
    expect(summary.byOrigin.find((row) => row.origin === "public_link")).toMatchObject({
      activeParticipants: 1,
    });
    expect(summary.interaction).toMatchObject({
      medianVoiceDurationSeconds: 300,
      medianParticipantTurns: 2.5,
    });
    expect(summary.voiceHealth.errors).toMatchObject({ value: 1, total: 2, rate: 50 });
    expect(summary.attention).toMatchObject({
      total: 4,
      unusedDirectAccesses: { count: 1 },
      inactiveParticipants: { count: 1 },
      interruptedInteractions: { count: 1 },
      unavailableAvatars: { count: 1 },
    });
    expect(summary.avatars.reduce((total, avatar) => total + avatar.engagedConversations, 0)).toBe(3);
    expect(summary.recentActivity[0]).toMatchObject({
      conversationId: "voice-no-transcript",
      participantKey: createParticipantKey("other@example.com"),
    });
  });

  it("flags an inactive participant after public-only activity without treating it as direct activation", async () => {
    const data = createSummaryData();
    data.grants = [
      grant(
        "grant-public-only",
        "avatar-1",
        "public-only@example.com",
        "active",
        "2026-06-01T10:00:00.000Z",
        undefined,
        "2026-07-20T10:00:00.000Z"
      ),
    ];

    const summary = await createCreatorDashboardService({
      repository: createRepository(data),
      now: () => now,
    }).getSummary("owner-1", { days: 30, timeZone: "UTC" });

    expect(summary.attention.unusedDirectAccesses.count).toBe(1);
    expect(summary.attention.inactiveParticipants).toMatchObject({
      count: 1,
      items: [{ participantKey: createParticipantKey("public-only@example.com") }],
    });
  });

  it("preserves the total interrupted count while returning only the bounded item list", async () => {
    const data = createSummaryData();
    const interrupted = data.interruptedConversations[0]!;
    data.avatars = data.avatars.map((avatar) => ({
      ...avatar,
      providerAgentId: `provider-${avatar.id}`,
      providerSyncStatus: "synced",
    }));
    data.grants = [];
    data.interruptedConversations = Array.from({ length: 5 }, (_, index) => ({
      ...interrupted,
      sessionId: `voice-error-${index}`,
      conversationId: `conversation-error-${index}`,
      totalCount: 12,
    }));

    const summary = await createCreatorDashboardService({
      repository: createRepository(data),
      now: () => now,
    }).getSummary("owner-1", { days: 30, timeZone: "UTC" });

    expect(summary.attention.interruptedInteractions).toMatchObject({ count: 12 });
    expect(summary.attention.interruptedInteractions.items).toHaveLength(5);
    expect(summary.attention.total).toBe(12);
  });

  it("counts recurrence by local date and builds weekly buckets for 90 days", async () => {
    const data = createSummaryData();
    data.activityBuckets = [
      activity(
        "same-conversation",
        "avatar-1",
        "person@example.com",
        "access_grant",
        "text",
        "2026-08-15",
        1
      ),
      activity(
        "same-conversation",
        "avatar-1",
        "person@example.com",
        "access_grant",
        "text",
        "2026-08-16",
        1
      ),
    ];
    const summary = await createCreatorDashboardService({
      repository: createRepository(data),
      now: () => now,
    }).getSummary("owner-1", { days: 90, timeZone: "America/Argentina/Buenos_Aires" });

    expect(summary.overview.returningParticipants).toMatchObject({ value: 1, total: 1, rate: 100 });
    expect(summary.overview.engagedConversations.value).toBe(1);
    expect(summary.trend.granularity).toBe("week");
    expect(summary.trend.points).toHaveLength(13);
  });

  it("closes the activation cohort at seven days without moving grants between periods", async () => {
    const data = createSummaryData();
    data.activityBuckets = [];
    data.grants = [
      grant(
        "grant-before-close",
        "avatar-1",
        "before@example.com",
        "revoked",
        "2026-07-20T10:00:00.000Z",
        "2026-07-27T09:59:59.999Z"
      ),
      grant(
        "grant-at-close",
        "avatar-1",
        "boundary@example.com",
        "revoked",
        "2026-07-21T10:00:00.000Z",
        "2026-07-28T10:00:00.000Z"
      ),
    ];

    const summary = await createCreatorDashboardService({
      repository: createRepository(data),
      now: () => now,
    }).getSummary("owner-1", { days: 30, timeZone: "UTC" });

    expect(summary.overview.directAccessActivation).toMatchObject({ value: 1, total: 2, rate: 50 });
  });

  it("excludes access grants whose seven-day window has not closed yet", async () => {
    const data = createSummaryData();
    data.activityBuckets = [];
    data.grants = [
      grant(
        "grant-mature",
        "avatar-1",
        "mature@example.com",
        "active",
        "2026-08-09T14:00:00.000Z",
        "2026-08-10T10:00:00.000Z"
      ),
      grant(
        "grant-closes-later",
        "avatar-1",
        "later@example.com",
        "active",
        "2026-08-09T20:00:00.000Z",
        "2026-08-10T10:00:00.000Z"
      ),
    ];

    const summary = await createCreatorDashboardService({
      repository: createRepository(data),
      now: () => now,
    }).getSummary("owner-1", { days: 30, timeZone: "UTC" });

    expect(summary.overview.directAccessActivation).toMatchObject({ value: 1, total: 1, rate: 100 });
    expect(
      summary.avatars.find((avatar) => avatar.avatarId === "avatar-1")?.directAccessActivation
    ).toMatchObject({ value: 1, total: 1, rate: 100 });
  });

  it("attributes terminal voice metrics by end time without rewriting earlier periods", async () => {
    const data = createSummaryData();
    data.activityBuckets = [];
    data.grants = [];
    data.voiceSessions = [
      voiceSession(
        "cross-boundary-success",
        "ended",
        "2026-07-17T23:58:00.000Z",
        "2026-07-17T23:59:00.000Z",
        "2026-07-18T00:05:00.000Z"
      ),
      voiceSession(
        "ends-after-range",
        "errored",
        "2026-08-16T10:00:00.000Z",
        undefined,
        "2026-08-17T00:01:00.000Z"
      ),
      voiceSession(
        "unactivated-end",
        "ended",
        "2026-08-10T10:00:00.000Z",
        undefined,
        "2026-08-10T10:01:00.000Z"
      ),
      voiceSession(
        "current-error",
        "errored",
        "2026-08-11T10:00:00.000Z",
        undefined,
        "2026-08-11T10:00:02.000Z"
      ),
    ];

    const summary = await createCreatorDashboardService({
      repository: createRepository(data),
      now: () => now,
    }).getSummary("owner-1", { days: 30, timeZone: "UTC" });

    expect(summary.voiceHealth.errors).toMatchObject({ value: 1, total: 2, rate: 50 });
    expect(summary.interaction.medianVoiceDurationSeconds).toBe(360);
  });

  it("uses local midnights across DST instead of fixed 24-hour periods", () => {
    const ranges = getDashboardRanges(new Date("2026-03-09T15:00:00.000Z"), 7, "America/New_York");

    expect(ranges.current.from.toISOString()).toBe("2026-03-03T05:00:00.000Z");
    expect(ranges.current.to.toISOString()).toBe("2026-03-10T04:00:00.000Z");
    expect(ranges.current.to.getTime() - ranges.current.from.getTime()).toBe(167 * 60 * 60 * 1_000);
  });

  it("uses the first representable instant when DST skips local midnight", () => {
    const ranges = getDashboardRanges(new Date("2026-09-05T15:00:00.000Z"), 7, "America/Santiago");

    expect(ranges.current.to.toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });

  it("returns explicit empty metric states", async () => {
    const empty = createSummaryData();
    empty.avatars = [];
    empty.activityBuckets = [];
    empty.grants = [];
    empty.voiceSessions = [];
    empty.interruptedConversations = [];
    empty.avatarLastActivity = [];
    const summary = await createCreatorDashboardService({
      repository: createRepository(empty),
      now: () => now,
    }).getSummary("owner-1", { days: 30, timeZone: "UTC" });

    expect(summary.hasOwnedAvatars).toBe(false);
    expect(summary.overview.returningParticipants.rate).toBeNull();
    expect(summary.trend.points).toHaveLength(30);
  });

  it("keeps disabled avatars in history without raising a configuration alert", async () => {
    const data = createSummaryData();
    data.avatars = [
      {
        ...data.avatars[0]!,
        status: "disabled",
      },
    ];
    data.activityBuckets = data.activityBuckets.filter((row) => row.avatarAgentId === "avatar-1");
    data.grants = [];
    data.voiceSessions = [];
    data.interruptedConversations = [];
    data.avatarLastActivity = [
      { avatarAgentId: "avatar-1", lastActivityAt: new Date("2026-08-10T10:00:00.000Z") },
    ];

    const summary = await createCreatorDashboardService({
      repository: createRepository(data),
      now: () => now,
    }).getSummary("owner-1", { days: 30, timeZone: "UTC" });

    expect(summary.avatars).toEqual([expect.objectContaining({ avatarId: "avatar-1", health: "disabled" })]);
    expect(summary.attention.unavailableAvatars.count).toBe(0);
  });
});

describe("@yuni/api creator dashboard endpoint", () => {
  async function setup() {
    const repository = createRepository();
    const app = new Hono<CreatorSessionEnv>();
    app.use(
      "*",
      createCreatorSessionMiddleware({
        async findPublicById(userId) {
          if (userId !== "owner-1") return null;
          return {
            id: userId,
            email: "owner@example.com",
            name: "Owner",
            imageUrl: null,
            createdAt: now,
            updatedAt: now,
          };
        },
      })
    );
    app.route("/", createCreatorDashboardController({ repository, now: () => now }));
    const token = await createSessionToken({ id: "owner-1", email: "owner@example.com", name: "Owner" });
    return { app, repository, cookie: `${SESSION_COOKIE_NAME}=${token}` };
  }

  it("requires authentication and scopes aggregate queries to the owner", async () => {
    const { app, repository, cookie } = await setup();
    expect((await app.request("/dashboard/creator-summary")).status).toBe(401);

    const response = await app.request(
      "/dashboard/creator-summary?days=7&timeZone=America%2FArgentina%2FBuenos_Aires",
      { headers: { Cookie: cookie } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        period: expect.objectContaining({ timeZone: "America/Argentina/Buenos_Aires" }),
      })
    );
    expect(repository.getSummaryData).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ timeZone: "America/Argentina/Buenos_Aires" })
    );
  });

  it("normalizes browser time-zone aliases before querying PostgreSQL", async () => {
    const { app, repository, cookie } = await setup();

    const response = await app.request("/dashboard/creator-summary?days=30&timeZone=America%2FBuenos_Aires", {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    expect(repository.getSummaryData).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({ timeZone: "America/Argentina/Buenos_Aires" })
    );
  });

  it("defaults to 30 days and UTC and rejects unsupported periods or zones", async () => {
    const { app, repository, cookie } = await setup();
    expect((await app.request("/dashboard/creator-summary", { headers: { Cookie: cookie } })).status).toBe(
      200
    );
    expect(repository.getSummaryData).toHaveBeenLastCalledWith(
      "owner-1",
      expect.objectContaining({ timeZone: "UTC" })
    );
    expect(
      (await app.request("/dashboard/creator-summary?days=14", { headers: { Cookie: cookie } })).status
    ).toBe(400);
    expect(
      (await app.request("/dashboard/creator-summary?days=30.0", { headers: { Cookie: cookie } })).status
    ).toBe(400);
    expect(
      (
        await app.request("/dashboard/creator-summary?timeZone=Mars%2FOlympus", {
          headers: { Cookie: cookie },
        })
      ).status
    ).toBe(400);
  });
});
