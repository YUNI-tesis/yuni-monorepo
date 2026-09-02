import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorDashboardContent } from "./app/dashboard/page";
import { buildActivityTrendAxisTicks } from "./app/dashboard/components/ActivityTrend";
import { formatSimpleRate } from "./app/dashboard/components/presentation";
import {
  getCreatorDashboardSummary,
  type ApiCreatorDashboardSummary,
  type ApiDashboardRateMetric,
} from "./lib/api/dashboard-api";
import {
  formatDashboardCountDelta,
  formatDashboardDuration,
  formatDashboardPeriod,
  formatDashboardRate,
  formatDashboardRateDelta,
  getDashboardAttentionPath,
  getDashboardResourceTranscriptPath,
  getDashboardTranscriptPath,
} from "./lib/creator-dashboard";

const rate = (value: number, total: number, currentRate: number | null): ApiDashboardRateMetric => ({
  value,
  total,
  rate: currentRate,
  previousValue: 1,
  previousTotal: 4,
  previousRate: 25,
  changePercentagePoints: currentRate === null ? null : currentRate - 25,
});

function createSummary(overrides: Partial<ApiCreatorDashboardSummary> = {}): ApiCreatorDashboardSummary {
  return {
    period: {
      days: 30,
      timeZone: "America/Argentina/Buenos_Aires",
      from: "2026-07-18T03:00:00.000Z",
      to: "2026-08-17T03:00:00.000Z",
      previousFrom: "2026-06-18T03:00:00.000Z",
      previousTo: "2026-07-18T03:00:00.000Z",
    },
    hasOwnedAvatars: true,
    overview: {
      activeParticipants: { value: 4, previous: 2, changePercent: 100 },
      engagedConversations: { value: 7, previous: 5, changePercent: 40 },
      returningParticipants: rate(2, 4, 50),
      directAccessActivation: rate(3, 5, 60),
    },
    byOrigin: [
      {
        origin: "all",
        activeParticipants: 4,
        engagedConversations: 7,
        returningParticipants: { value: 2, total: 4, rate: 50 },
        conversationsPerParticipant: 1.8,
      },
      {
        origin: "access_grant",
        activeParticipants: 3,
        engagedConversations: 5,
        returningParticipants: { value: 1, total: 3, rate: 33.3 },
        conversationsPerParticipant: 1.7,
      },
      {
        origin: "public_link",
        activeParticipants: 2,
        engagedConversations: 2,
        returningParticipants: { value: 0, total: 2, rate: 0 },
        conversationsPerParticipant: 1,
      },
    ],
    trend: {
      granularity: "day",
      points: [
        { date: "2026-08-14", dateTo: "2026-08-14", engagedConversations: 2, participants: 1 },
        { date: "2026-08-15", dateTo: "2026-08-15", engagedConversations: 5, participants: 4 },
      ],
    },
    interaction: {
      conversationMix: { value: 3, total: 7, rate: 42.9 },
      medianVoiceDurationSeconds: 305,
      medianParticipantTurns: 4,
    },
    voiceHealth: { errors: rate(1, 6, 16.7) },
    attention: {
      total: 2,
      unusedDirectAccesses: {
        count: 1,
        items: [
          {
            type: "unused_direct_access",
            id: "grant-1",
            avatarId: "avatar-1",
            avatarName: "Álgebra",
            participantKey: "p_person",
            participantName: "Ana",
            participantEmail: "person@example.com",
            occurredAt: "2026-08-01T10:00:00.000Z",
          },
        ],
      },
      inactiveParticipants: { count: 0, items: [] },
      interruptedInteractions: {
        count: 1,
        items: [
          {
            type: "interrupted_interaction",
            id: "session-1",
            avatarId: "avatar-1",
            avatarName: "Álgebra",
            participantKey: "p_person",
            participantName: "Ana",
            participantEmail: "person@example.com",
            conversationId: "conversation-1",
            occurredAt: "2026-08-15T10:00:00.000Z",
          },
        ],
      },
      unavailableAvatars: { count: 0, items: [] },
    },
    avatars: [
      {
        avatarId: "avatar-1",
        avatarName: "Álgebra",
        status: "active",
        health: "available",
        activeParticipants: 4,
        engagedConversations: 7,
        returningParticipants: { value: 2, total: 4, rate: 50 },
        directAccessActivation: { value: 3, total: 5, rate: 60 },
        lastActivityAt: "2026-08-15T10:00:00.000Z",
      },
    ],
    recentActivity: [
      {
        conversationId: "conversation-1",
        avatarId: "avatar-1",
        avatarName: "Álgebra",
        participantKey: "p_person",
        participantName: "Ana",
        participantEmail: "person@example.com",
        origin: "access_grant",
        mode: "voice",
        title: "Repaso de funciones",
        occurredAt: "2026-08-15T10:00:00.000Z",
      },
    ],
    methodology: {
      activityDefinition: "participant_message_or_activated_voice",
      identity: "normalized_email",
      activationWindowDays: 7,
      inactivityDays: 14,
      disclaimer: "Estas métricas describen actividad objetiva y no representan progreso académico.",
    },
    ...overrides,
  };
}

describe("creator dashboard presentation", () => {
  it("renders the four objective KPIs, actionable states and accessible exact trend data", () => {
    const html = renderToStaticMarkup(
      createElement(CreatorDashboardContent, {
        summary: createSummary(),
        onNavigate: () => undefined,
      })
    );

    expect(html).toContain("Participantes activos");
    expect(html).toContain("Conversaciones con actividad");
    expect(html).toContain("Participantes que volvieron");
    expect(html).toContain("Accesos activados en 7 días");
    expect(html).toContain("Por origen");
    expect(html).toContain("Abrir Compartir");
    expect(html).toContain("Ver conversación");
    expect(html).toContain("Ver tabla exacta");
    expect(html).toContain("Cómo se calculan estas métricas");
    expect(html).toContain("no representan progreso académico");
    expect(html).not.toContain("Profundidad típica");

    const firstHotspot = html.match(/style="left:([^%]+)%;top:([^%]+)%"/);
    expect(Number(firstHotspot?.[1])).toBeCloseTo(28.82, 2);
    expect(Number(firstHotspot?.[2])).toBeCloseTo(71.33, 2);
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

  it("renders group performance once and labels recent group activity as a resource", () => {
    const summary = createSummary({
      hasOwnedResources: true,
      groups: [
        {
          groupId: "group-1",
          groupName: "Consejo de tesis",
          status: "active",
          health: "available",
          activeParticipants: 2,
          engagedConversations: 1,
          returningParticipants: { value: 1, total: 2, rate: 50 },
          directAccessActivation: { value: 1, total: 1, rate: 100 },
          lastActivityAt: "2026-08-15T10:00:00.000Z",
        },
      ],
      recentActivity: [
        {
          conversationId: "group-conversation-1",
          resource: { type: "group", id: "group-1", name: "Consejo de tesis" },
          resourceKind: "group",
          resourceId: "group-1",
          resourceName: "Consejo de tesis",
          groupId: "group-1",
          groupName: "Consejo de tesis",
          participantKey: "p_person",
          participantName: "Ana",
          participantEmail: "person@example.com",
          origin: "access_grant",
          mode: "voice",
          title: "Consulta grupal",
          occurredAt: "2026-08-15T10:00:00.000Z",
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(CreatorDashboardContent, { summary, onNavigate: () => undefined })
    );

    expect(html).toContain("Actividad por grupo");
    expect(html.match(/Consejo de tesis/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Cada conversación grupal cuenta una sola vez");
    expect(html).toContain("Grupo");
  });
});

describe("creator dashboard helpers", () => {
  it("positions unique integer axis labels at their exact scale value", () => {
    expect(buildActivityTrendAxisTicks(1)).toEqual([
      { value: 1, fraction: 0 },
      { value: 0, fraction: 1 },
    ]);

    const ticks = buildActivityTrendAxisTicks(3);
    expect(ticks.map((tick) => tick.value)).toEqual([3, 2, 0]);
    expect(ticks[0]?.fraction).toBe(0);
    expect(ticks[1]?.fraction).toBeCloseTo(1 / 3);
    expect(ticks[2]?.fraction).toBe(1);
  });

  it("formats comparisons, durations and local periods explicitly", () => {
    expect(formatDashboardCountDelta({ value: 3, previous: 0, changePercent: null })).toBe(
      "Sin base anterior"
    );
    expect(formatDashboardRate(null)).toBe("—");
    expect(
      formatDashboardRateDelta({
        value: 0,
        total: 0,
        rate: null,
        previousValue: 0,
        previousTotal: 0,
        previousRate: null,
        changePercentagePoints: null,
      })
    ).toBe("0 de 0 · sin datos suficientes · sin base anterior");
    expect(
      formatDashboardRateDelta({
        value: 2,
        total: 4,
        rate: 50,
        previousValue: 0,
        previousTotal: 0,
        previousRate: null,
        changePercentagePoints: null,
      })
    ).toBe("2 de 4 · sin base anterior");
    expect(formatSimpleRate({ value: 0, total: 0, rate: null })).toBe("0/0 · sin datos");
    expect(formatDashboardDuration(305)).toBe("5 min 05 s");
    expect(
      formatDashboardPeriod(
        "2026-07-18T03:00:00.000Z",
        "2026-08-17T03:00:00.000Z",
        "America/Argentina/Buenos_Aires"
      )
    ).toBe("18 jul–16 ago");
  });

  it("builds a specific deep link for every action", () => {
    expect(
      getDashboardAttentionPath({
        type: "unused_direct_access",
        id: "grant-1",
        avatarId: "avatar 1",
        avatarName: "Avatar",
        participantKey: "p/person",
        participantName: null,
        participantEmail: "person@example.com",
        occurredAt: null,
      })
    ).toBe("/avatars/avatar%201?tab=compartir");
    expect(
      getDashboardAttentionPath({
        type: "interrupted_interaction",
        id: "session-1",
        avatarId: "avatar 1",
        avatarName: "Avatar",
        participantKey: "p/person",
        participantName: null,
        participantEmail: "person@example.com",
        conversationId: "conversation 1",
        occurredAt: null,
      })
    ).toBe("/avatars/avatar%201/activity/p%2Fperson?conversation=conversation%201");
    expect(getDashboardTranscriptPath("avatar-1", "p_person", "conversation-1")).toBe(
      "/avatars/avatar-1/activity/p_person?conversation=conversation-1"
    );
    const groupResource = {
      resource: { type: "group" as const, id: "group 1", name: "Consejo" },
      resourceKind: "group" as const,
      resourceId: "group 1",
      resourceName: "Consejo",
      groupId: "group 1",
      groupName: "Consejo",
    };
    expect(
      getDashboardAttentionPath({
        ...groupResource,
        type: "unused_direct_access",
        id: "group-grant-1",
        participantKey: "p/person",
        participantName: null,
        participantEmail: "person@example.com",
        occurredAt: null,
      })
    ).toBe("/groups/group%201/share");
    expect(
      getDashboardAttentionPath({
        ...groupResource,
        type: "interrupted_interaction",
        id: "group-session-1",
        participantKey: "p/person",
        participantName: null,
        participantEmail: "person@example.com",
        conversationId: "conversation 1",
        occurredAt: null,
      })
    ).toBe("/groups/group%201/activity/p%2Fperson?conversation=conversation%201");
    expect(getDashboardResourceTranscriptPath(groupResource, "p/person", "conversation 1")).toBe(
      "/groups/group%201/activity/p%2Fperson?conversation=conversation%201"
    );
  });
});

describe("creator dashboard API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends period and browser time zone without custom from/to filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(createSummary()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await getCreatorDashboardSummary({ days: 90, timeZone: "America/Argentina/Buenos_Aires" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/dashboard/creator-summary?days=90&timeZone=America%2FArgentina%2FBuenos_Aires"
    );
  });
});
