import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorDashboardContent } from "./app/dashboard/page";
import { getCreatorDashboardSummary, type ApiCreatorDashboardSummary } from "./lib/api/dashboard-api";
import {
  formatDashboardCountDelta,
  formatDashboardDuration,
  formatDashboardPeriod,
  formatDashboardRate,
  getDashboardAttentionPath,
  getDashboardTranscriptPath,
} from "./lib/creator-dashboard";

function createSummary(overrides: Partial<ApiCreatorDashboardSummary> = {}): ApiCreatorDashboardSummary {
  return {
    period: {
      from: "2026-07-18T00:00:00.000Z",
      to: "2026-08-17T00:00:00.000Z",
      previousFrom: "2026-06-18T00:00:00.000Z",
      previousTo: "2026-07-18T00:00:00.000Z",
    },
    hasOwnedAvatars: true,
    overview: {
      activeParticipants: { value: 4, previous: 2, changePercent: 100 },
      conversations: { value: 7, previous: 5, changePercent: 40 },
      recurringParticipants: {
        value: 2,
        total: 4,
        rate: 50,
        previousRate: 25,
        changePercentagePoints: 25,
      },
      completedSessions: {
        value: 5,
        total: 6,
        rate: 83.3,
        previousRate: 100,
        changePercentagePoints: -16.7,
      },
      medianVoiceDurationSeconds: 305,
      medianParticipantTurns: 4,
    },
    trend: [
      { date: "2026-08-14", conversations: 2, participants: 1 },
      { date: "2026-08-15", conversations: 5, participants: 4 },
    ],
    attention: {
      total: 2,
      neverUsedAccesses: {
        count: 1,
        items: [
          {
            type: "never_used_access",
            id: "grant-1",
            avatarId: "avatar-1",
            avatarName: "Álgebra",
            participantKey: "p_person",
            participantEmail: "person@example.com",
            occurredAt: "2026-08-01T10:00:00.000Z",
          },
        ],
      },
      inactiveParticipants: { count: 0, items: [] },
      erroredSessions: {
        count: 1,
        items: [
          {
            type: "errored_session",
            id: "session-1",
            avatarId: "avatar-1",
            avatarName: "Álgebra",
            participantKey: "p_person",
            participantEmail: "person@example.com",
            conversationId: "conversation-1",
            occurredAt: "2026-08-15T10:00:00.000Z",
          },
        ],
      },
      failedAvatars: { count: 0, items: [] },
    },
    avatars: [
      {
        avatarId: "avatar-1",
        avatarName: "Álgebra",
        activeParticipants: 4,
        conversations: 7,
        recurringRate: 50,
        medianVoiceDurationSeconds: 305,
        lastActivityAt: "2026-08-15T10:00:00.000Z",
        attentionCount: 2,
      },
    ],
    recentActivity: [
      {
        conversationId: "conversation-1",
        avatarId: "avatar-1",
        avatarName: "Álgebra",
        participantKey: "p_person",
        participantEmail: "person@example.com",
        mode: "voice",
        status: "ended",
        occurredAt: "2026-08-15T10:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("creator dashboard presentation", () => {
  it("renders action-oriented metrics, attention, trends and transcript access", () => {
    const html = renderToStaticMarkup(
      createElement(CreatorDashboardContent, {
        summary: createSummary(),
        onNavigate: () => undefined,
      })
    );

    expect(html).toContain("Cómo están usando tus avatares");
    expect(html).toContain("Participantes activos");
    expect(html).toContain("Participantes recurrentes");
    expect(html).toContain("Necesita atención");
    expect(html).toContain("person@example.com");
    expect(html).toContain("Actividad diaria");
    expect(html).toContain("Ver datos exactos");
    expect(html).toContain("Actividad por avatar");
    expect(html).toContain("Ver transcript");
    expect(html).not.toContain("Procesando");
    expect(html).not.toContain("Avatares actualizados");
  });

  it("renders a creator-specific empty state without fake zero-value insights", () => {
    const html = renderToStaticMarkup(
      createElement(CreatorDashboardContent, {
        summary: createSummary({ hasOwnedAvatars: false }),
        onNavigate: () => undefined,
      })
    );

    expect(html).toContain("Creá tu primer avatar");
    expect(html).not.toContain("Participantes activos");
  });
});

describe("creator dashboard helpers", () => {
  it("formats comparisons and unavailable values explicitly", () => {
    expect(formatDashboardCountDelta({ value: 3, previous: 0, changePercent: null })).toBe(
      "Sin base anterior"
    );
    expect(formatDashboardCountDelta({ value: 1, previous: 2, changePercent: -50 })).toContain("-50%");
    expect(formatDashboardRate(null)).toBe("—");
    expect(formatDashboardDuration(null)).toBe("—");
    expect(formatDashboardDuration(305)).toBe("5 min 05 s");
    expect(
      formatDashboardPeriod("2026-07-18T00:00:00.000Z", "2026-08-17T00:00:00.000Z")
    ).toBe("18 jul–16 ago");
  });

  it("builds deep links for attention and transcripts", () => {
    expect(
      getDashboardAttentionPath({
        type: "errored_session",
        id: "session-1",
        avatarId: "avatar 1",
        avatarName: "Avatar",
        participantKey: "p/person",
        participantEmail: "person@example.com",
        conversationId: "conversation 1",
        occurredAt: null,
      })
    ).toBe("/avatars/avatar%201/activity/p%2Fperson?conversation=conversation%201");
    expect(getDashboardTranscriptPath("avatar-1", "p_person", "conversation-1")).toBe(
      "/avatars/avatar-1/activity/p_person?conversation=conversation-1"
    );
  });
});

describe("creator dashboard API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the aggregate endpoint with optional date filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(createSummary()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getCreatorDashboardSummary({ from: "2026-08-01", to: "2026-08-15" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:4000/dashboard/creator-summary?from=2026-08-01&to=2026-08-15"
    );
  });
});
