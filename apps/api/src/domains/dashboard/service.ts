import { createHash } from "node:crypto";
import type {
  CreatorDashboardConversationRecord,
  CreatorDashboardRepository,
  CreatorDashboardSummaryData,
} from "./repository";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_PERIOD_DAYS = 30;
const UNUSED_ACCESS_DAYS = 7;
const INACTIVE_PARTICIPANT_DAYS = 14;

export type CreatorDashboardRange = {
  from: Date;
  to: Date;
};

export type CreatorDashboardServiceDependencies = {
  repository: CreatorDashboardRepository;
  now?: () => Date;
};

export function createCreatorDashboardService({
  repository,
  now = () => new Date(),
}: CreatorDashboardServiceDependencies) {
  return {
    async getSummary(ownerId: string, requestedRange?: CreatorDashboardRange) {
      const currentNow = now();
      const range = requestedRange ?? getDefaultRange(currentNow);
      const durationMs = range.to.getTime() - range.from.getTime();
      const previousRange = {
        from: new Date(range.from.getTime() - durationMs),
        to: range.from,
      };
      const data = await repository.getSummaryData(ownerId, previousRange.from);

      return buildCreatorDashboardSummary(data, range, previousRange, currentNow);
    },
  };
}

export function buildCreatorDashboardSummary(
  data: CreatorDashboardSummaryData,
  range: CreatorDashboardRange,
  previousRange: CreatorDashboardRange,
  currentNow: Date
) {
  const avatarsById = new Map(data.avatars.map((avatar) => [avatar.id, avatar]));
  const conversations = data.conversations.filter(
    (conversation): conversation is CreatorDashboardConversationRecord & { participantEmail: string } =>
      Boolean(conversation.participantEmail)
  );
  const currentConversations = conversations.filter((conversation) =>
    isWithin(conversation.createdAt, range)
  );
  const previousConversations = conversations.filter((conversation) =>
    isWithin(conversation.createdAt, previousRange)
  );
  const currentParticipants = participantActivityDays(currentConversations);
  const previousParticipants = participantActivityDays(previousConversations);
  const currentSessions = sessionsWithin(conversations, range);
  const previousSessions = sessionsWithin(conversations, previousRange);
  const currentSessionOutcome = sessionOutcome(currentSessions);
  const previousSessionOutcome = sessionOutcome(previousSessions);
  const referenceNow = new Date(Math.min(currentNow.getTime(), range.to.getTime()));
  const attention = buildAttention(data, conversations, avatarsById, referenceNow, range);

  const avatarMetrics = data.avatars
    .map((avatar) => {
      const avatarConversations = currentConversations.filter(
        (conversation) => conversation.avatarAgentId === avatar.id
      );
      const historicalAvatarConversations = conversations.filter(
        (conversation) => conversation.avatarAgentId === avatar.id
      );
      const participants = participantActivityDays(avatarConversations);
      const avatarSessions = sessionsWithin(avatarConversations, range);

      return {
        avatarId: avatar.id,
        avatarName: avatar.name,
        activeParticipants: participants.size,
        conversations: avatarConversations.length,
        recurringRate: rate(countRecurring(participants), participants.size),
        medianVoiceDurationSeconds: medianDuration(avatarSessions),
        lastActivityAt: latestActivityAt(historicalAvatarConversations)?.toISOString() ?? null,
        attentionCount: attention.items.filter((item) => item.avatarId === avatar.id).length,
      };
    })
    .sort(
      (left, right) =>
        right.conversations - left.conversations ||
        right.activeParticipants - left.activeParticipants ||
        left.avatarName.localeCompare(right.avatarName, "es")
    );

  return {
    period: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      previousFrom: previousRange.from.toISOString(),
      previousTo: previousRange.to.toISOString(),
    },
    hasOwnedAvatars: data.avatars.length > 0,
    overview: {
      activeParticipants: countMetric(currentParticipants.size, previousParticipants.size),
      conversations: countMetric(currentConversations.length, previousConversations.length),
      recurringParticipants: rateMetric(
        countRecurring(currentParticipants),
        currentParticipants.size,
        countRecurring(previousParticipants),
        previousParticipants.size
      ),
      completedSessions: rateMetric(
        currentSessionOutcome.completed,
        currentSessionOutcome.total,
        previousSessionOutcome.completed,
        previousSessionOutcome.total
      ),
      medianVoiceDurationSeconds: medianDuration(currentSessions),
      medianParticipantTurns: median(
        currentConversations
          .map((conversation) => conversation._count.messages)
          .filter((turns) => turns > 0)
      ),
    },
    trend: buildTrend(currentConversations, range),
    attention: {
      total: attention.items.length,
      neverUsedAccesses: attentionGroup(attention.items, "never_used_access"),
      inactiveParticipants: attentionGroup(attention.items, "inactive_participant"),
      erroredSessions: attentionGroup(attention.items, "errored_session"),
      failedAvatars: attentionGroup(attention.items, "failed_avatar"),
    },
    avatars: avatarMetrics,
    recentActivity: [...conversations]
      .sort((left, right) => activityAt(right).getTime() - activityAt(left).getTime())
      .slice(0, 8)
      .map((conversation) => ({
        conversationId: conversation.id,
        avatarId: conversation.avatarAgentId,
        avatarName: avatarsById.get(conversation.avatarAgentId)?.name ?? "Avatar",
        participantKey: createParticipantKey(conversation.participantEmail),
        participantEmail: normalizeEmail(conversation.participantEmail),
        mode: conversation.mode,
        status: conversation.status,
        occurredAt: activityAt(conversation).toISOString(),
      })),
  };
}

function getDefaultRange(now: Date): CreatorDashboardRange {
  const endOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return {
    from: new Date(endOfToday.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS),
    to: endOfToday,
  };
}

function isWithin(value: Date, range: CreatorDashboardRange) {
  const timestamp = value.getTime();
  return timestamp >= range.from.getTime() && timestamp < range.to.getTime();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function participantActivityDays(
  conversations: Array<CreatorDashboardConversationRecord & { participantEmail: string }>
) {
  const participants = new Map<string, Set<string>>();

  for (const conversation of conversations) {
    const email = normalizeEmail(conversation.participantEmail);
    const days = participants.get(email) ?? new Set<string>();
    days.add(toDateKey(conversation.createdAt));
    participants.set(email, days);
  }

  return participants;
}

function countRecurring(participants: Map<string, Set<string>>) {
  return [...participants.values()].filter((days) => days.size >= 2).length;
}

function sessionsWithin(
  conversations: Array<CreatorDashboardConversationRecord & { participantEmail: string }>,
  range: CreatorDashboardRange
) {
  return conversations.flatMap((conversation) =>
    conversation.realtimeSessions
      .filter((session) => isWithin(session.startedAt, range))
      .map((session) => ({ ...session, conversation }))
  );
}

function sessionOutcome(sessions: ReturnType<typeof sessionsWithin>) {
  const completed = sessions.filter((session) => session.status === "ended").length;
  const errored = sessions.filter((session) => session.status === "errored").length;
  return { completed, total: completed + errored };
}

function countMetric(value: number, previous: number) {
  return { value, previous, changePercent: percentageChange(value, previous) };
}

function rateMetric(value: number, total: number, previousValue: number, previousTotal: number) {
  const currentRate = rate(value, total);
  const previousRate = rate(previousValue, previousTotal);
  return {
    value,
    total,
    rate: currentRate,
    previousRate,
    changePercentagePoints:
      currentRate === null || previousRate === null ? null : round(currentRate - previousRate, 1),
  };
}

function percentageChange(value: number, previous: number) {
  if (previous === 0) return value === 0 ? 0 : null;
  return round(((value - previous) / previous) * 100, 1);
}

function rate(value: number, total: number) {
  return total === 0 ? null : round((value / total) * 100, 1);
}

function medianDuration(sessions: ReturnType<typeof sessionsWithin>) {
  return median(
    sessions.flatMap((session) =>
      session.status === "ended" && session.endedAt
        ? [Math.max(0, Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1_000))]
        : []
    )
  );
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2, 1)
    : (sorted[middle] ?? null);
}

function buildTrend(
  conversations: Array<CreatorDashboardConversationRecord & { participantEmail: string }>,
  range: CreatorDashboardRange
) {
  const buckets = new Map<string, { conversations: number; participants: Set<string> }>();
  for (
    let timestamp = startOfUtcDay(range.from).getTime();
    timestamp < range.to.getTime();
    timestamp += DAY_MS
  ) {
    buckets.set(toDateKey(new Date(timestamp)), { conversations: 0, participants: new Set() });
  }

  for (const conversation of conversations) {
    const bucket = buckets.get(toDateKey(conversation.createdAt));
    if (!bucket) continue;
    bucket.conversations += 1;
    bucket.participants.add(normalizeEmail(conversation.participantEmail));
  }

  return [...buckets].map(([date, bucket]) => ({
    date,
    conversations: bucket.conversations,
    participants: bucket.participants.size,
  }));
}

function buildAttention(
  data: CreatorDashboardSummaryData,
  conversations: Array<CreatorDashboardConversationRecord & { participantEmail: string }>,
  avatarsById: Map<string, CreatorDashboardSummaryData["avatars"][number]>,
  referenceNow: Date,
  range: CreatorDashboardRange
) {
  const unusedCutoff = referenceNow.getTime() - UNUSED_ACCESS_DAYS * DAY_MS;
  const inactiveCutoff = referenceNow.getTime() - INACTIVE_PARTICIPANT_DAYS * DAY_MS;
  const conversationKeys = new Set(
    conversations.map(
      (conversation) => `${conversation.avatarAgentId}:${normalizeEmail(conversation.participantEmail)}`
    )
  );
  const neverUsedAccesses = data.grants
    .filter(
      (grant) =>
        grant.createdAt.getTime() <= unusedCutoff &&
        !conversationKeys.has(`${grant.avatarAgentId}:${normalizeEmail(grant.participantEmail)}`)
    )
    .map((grant) => ({
      type: "never_used_access" as const,
      id: grant.id,
      avatarId: grant.avatarAgentId,
      avatarName: avatarsById.get(grant.avatarAgentId)?.name ?? "Avatar",
      participantKey: createParticipantKey(grant.participantEmail),
      participantEmail: normalizeEmail(grant.participantEmail),
      occurredAt: grant.createdAt.toISOString(),
    }));

  const lastActivity = new Map<
    string,
    {
      avatarId: string;
      participantEmail: string;
      occurredAt: Date;
    }
  >();
  for (const conversation of conversations) {
    const email = normalizeEmail(conversation.participantEmail);
    const key = `${conversation.avatarAgentId}:${email}`;
    const occurredAt = activityAt(conversation);
    const current = lastActivity.get(key);
    if (!current || occurredAt > current.occurredAt) {
      lastActivity.set(key, {
        avatarId: conversation.avatarAgentId,
        participantEmail: email,
        occurredAt,
      });
    }
  }

  const inactiveParticipants = [...lastActivity.values()]
    .filter((participant) => participant.occurredAt.getTime() < inactiveCutoff)
    .map((participant) => ({
      type: "inactive_participant" as const,
      id: `${participant.avatarId}:${participant.participantEmail}`,
      avatarId: participant.avatarId,
      avatarName: avatarsById.get(participant.avatarId)?.name ?? "Avatar",
      participantKey: createParticipantKey(participant.participantEmail),
      participantEmail: participant.participantEmail,
      occurredAt: participant.occurredAt.toISOString(),
    }));

  const erroredSessions = sessionsWithin(conversations, range)
    .filter((session) => session.status === "errored")
    .map((session) => ({
      type: "errored_session" as const,
      id: session.id,
      avatarId: session.conversation.avatarAgentId,
      avatarName: avatarsById.get(session.conversation.avatarAgentId)?.name ?? "Avatar",
      participantKey: createParticipantKey(session.conversation.participantEmail),
      participantEmail: normalizeEmail(session.conversation.participantEmail),
      conversationId: session.conversation.id,
      occurredAt: session.startedAt.toISOString(),
    }));

  const failedAvatars = data.avatars
    .filter((avatar) => avatar.providerSyncStatus === "failed")
    .map((avatar) => ({
      type: "failed_avatar" as const,
      id: avatar.id,
      avatarId: avatar.id,
      avatarName: avatar.name,
      participantKey: null,
      participantEmail: null,
      occurredAt: null,
    }));

  return {
    items: [
      ...neverUsedAccesses.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
      ...inactiveParticipants.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
      ...erroredSessions.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
      ...failedAvatars.sort((left, right) => left.avatarName.localeCompare(right.avatarName, "es")),
    ],
  };
}

function attentionGroup<
  TType extends "never_used_access" | "inactive_participant" | "errored_session" | "failed_avatar",
>(
  items: ReturnType<typeof buildAttention>["items"],
  type: TType
) {
  const matching = items.filter((item) => item.type === type);
  return { count: matching.length, items: matching.slice(0, 5) };
}

function activityAt(conversation: CreatorDashboardConversationRecord) {
  return conversation.lastMessageAt ?? conversation.createdAt;
}

function latestActivityAt(conversations: CreatorDashboardConversationRecord[]) {
  return conversations.reduce<Date | null>((latest, conversation) => {
    const value = activityAt(conversation);
    return !latest || value > latest ? value : latest;
  }, null);
}

function createParticipantKey(email: string) {
  return `p_${createHash("sha256").update(normalizeEmail(email)).digest("base64url")}`;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export type CreatorDashboardSummary = Awaited<
  ReturnType<ReturnType<typeof createCreatorDashboardService>["getSummary"]>
>;
