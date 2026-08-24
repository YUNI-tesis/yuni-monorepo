import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createCreatorDashboardController } from "./domains/dashboard/controller";
import type { CreatorDashboardRepository, CreatorDashboardSummaryData } from "./domains/dashboard/repository";
import { createCreatorDashboardService } from "./domains/dashboard/service";
import { createSessionToken, SESSION_COOKIE_NAME } from "./domains/auth/session";

const now = new Date("2026-08-16T15:00:00.000Z");

function createSummaryData(): CreatorDashboardSummaryData {
  return {
    avatars: [
      { id: "avatar-1", name: "Álgebra", providerSyncStatus: "failed" },
      { id: "avatar-2", name: "Historia", providerSyncStatus: "synced" },
    ],
    grants: [
      {
        id: "grant-unused",
        avatarAgentId: "avatar-1",
        participantEmail: "unused@example.com",
        createdAt: new Date("2026-07-01T10:00:00.000Z"),
      },
      {
        id: "grant-used",
        avatarAgentId: "avatar-1",
        participantEmail: "person@example.com",
        createdAt: new Date("2026-07-01T10:00:00.000Z"),
      },
    ],
    conversations: [
      conversation({
        id: "current-1",
        avatarAgentId: "avatar-1",
        participantEmail: "Person@Example.com",
        createdAt: "2026-08-01T10:00:00.000Z",
        userTurns: 3,
        sessions: [session("session-ended", "ended", "2026-08-01T10:00:00.000Z", "2026-08-01T10:05:00.000Z")],
      }),
      conversation({
        id: "current-2",
        avatarAgentId: "avatar-1",
        participantEmail: "person@example.com",
        createdAt: "2026-08-10T10:00:00.000Z",
        userTurns: 5,
        sessions: [session("session-error", "errored", "2026-08-10T10:00:00.000Z")],
      }),
      conversation({
        id: "current-3",
        avatarAgentId: "avatar-2",
        participantEmail: "other@example.com",
        createdAt: "2026-08-15T10:00:00.000Z",
        userTurns: 1,
        sessions: [session("session-active", "active", "2026-08-15T10:00:00.000Z")],
      }),
      conversation({
        id: "previous",
        avatarAgentId: "avatar-2",
        participantEmail: "previous@example.com",
        createdAt: "2026-07-10T10:00:00.000Z",
        userTurns: 2,
      }),
      conversation({
        id: "inactive",
        avatarAgentId: "avatar-2",
        participantEmail: "inactive@example.com",
        createdAt: "2026-06-01T10:00:00.000Z",
        userTurns: 4,
      }),
    ],
  };
}

function conversation(input: {
  id: string;
  avatarAgentId: string;
  participantEmail: string;
  createdAt: string;
  userTurns: number;
  sessions?: CreatorDashboardSummaryData["conversations"][number]["realtimeSessions"];
}): CreatorDashboardSummaryData["conversations"][number] {
  const createdAt = new Date(input.createdAt);
  return {
    id: input.id,
    avatarAgentId: input.avatarAgentId,
    participantEmail: input.participantEmail,
    mode: "voice",
    status: "ended",
    createdAt,
    lastMessageAt: new Date(createdAt.getTime() + 60_000),
    _count: { messages: input.userTurns },
    realtimeSessions: input.sessions ?? [],
  };
}

function session(id: string, status: "active" | "ended" | "errored", startedAt: string, endedAt?: string) {
  return {
    id,
    status,
    startedAt: new Date(startedAt),
    endedAt: endedAt ? new Date(endedAt) : null,
  };
}

function createRepository(data = createSummaryData()): CreatorDashboardRepository {
  return {
    getSummaryData: vi.fn().mockResolvedValue(data),
  };
}

describe("@yuni/api creator dashboard service", () => {
  it("computes actionable metrics, deduplicates emails and excludes unfinished sessions", async () => {
    const service = createCreatorDashboardService({
      repository: createRepository(),
      now: () => now,
    });

    const summary = await service.getSummary("owner-1");

    expect(summary.overview.activeParticipants).toEqual({
      value: 2,
      previous: 1,
      changePercent: 100,
    });
    expect(summary.overview.conversations).toEqual({ value: 3, previous: 1, changePercent: 200 });
    expect(summary.overview.recurringParticipants).toMatchObject({ value: 1, total: 2, rate: 50 });
    expect(summary.overview.completedSessions).toMatchObject({ value: 1, total: 2, rate: 50 });
    expect(summary.overview.medianVoiceDurationSeconds).toBe(300);
    expect(summary.overview.medianParticipantTurns).toBe(3);
    expect(summary.attention).toMatchObject({
      total: 5,
      neverUsedAccesses: { count: 1 },
      inactiveParticipants: { count: 2 },
      erroredSessions: { count: 1 },
      failedAvatars: { count: 1 },
    });
    expect(summary.avatars[0]).toMatchObject({
      avatarId: "avatar-1",
      conversations: 2,
      activeParticipants: 1,
      recurringRate: 100,
      medianVoiceDurationSeconds: 300,
    });
    expect(summary.recentActivity[0]).toMatchObject({
      conversationId: "current-3",
      participantEmail: "other@example.com",
    });
    expect(JSON.stringify(summary)).not.toMatch(/NaN|undefined/);
  });

  it("returns explicit empty and unavailable metric states", async () => {
    const service = createCreatorDashboardService({
      repository: createRepository({ avatars: [], grants: [], conversations: [] }),
      now: () => now,
    });

    const summary = await service.getSummary("owner-1");

    expect(summary.hasOwnedAvatars).toBe(false);
    expect(summary.overview.activeParticipants.changePercent).toBe(0);
    expect(summary.overview.recurringParticipants.rate).toBeNull();
    expect(summary.overview.completedSessions.rate).toBeNull();
    expect(summary.overview.medianVoiceDurationSeconds).toBeNull();
    expect(summary.trend).toHaveLength(30);
  });
});

describe("@yuni/api creator dashboard endpoint", () => {
  async function setup() {
    const repository = createRepository();
    const app = new Hono();
    app.route("/", createCreatorDashboardController({ repository, now: () => now }));
    const token = await createSessionToken({
      id: "owner-1",
      email: "owner@example.com",
      name: "Owner",
    });
    return { app, repository, cookie: `${SESSION_COOKIE_NAME}=${token}` };
  }

  it("requires authentication and scopes the query to the session owner", async () => {
    const { app, repository, cookie } = await setup();

    expect((await app.request("/dashboard/creator-summary")).status).toBe(401);
    const response = await app.request("/dashboard/creator-summary", {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    expect(repository.getSummaryData).toHaveBeenCalledWith("owner-1", expect.any(Date));
  });

  it("accepts inclusive date-only ranges and rejects invalid boundaries", async () => {
    const { app, repository, cookie } = await setup();
    const response = await app.request("/dashboard/creator-summary?from=2026-08-01&to=2026-08-15", {
      headers: { Cookie: cookie },
    });
    const invalid = await app.request("/dashboard/creator-summary?from=2026-08-15&to=2026-08-01", {
      headers: { Cookie: cookie },
    });
    const impossibleDate = await app.request("/dashboard/creator-summary?from=2026-02-31&to=2026-03-15", {
      headers: { Cookie: cookie },
    });

    expect(response.status).toBe(200);
    expect(repository.getSummaryData).toHaveBeenLastCalledWith(
      "owner-1",
      new Date("2026-07-17T00:00:00.000Z")
    );
    expect(invalid.status).toBe(400);
    expect(impossibleDate.status).toBe(400);
  });
});
