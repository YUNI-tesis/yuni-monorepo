import type { CreatorDashboardRepository, CreatorDashboardSummaryData } from "./repository";
import { createParticipantKey } from "../../utils/participant-key";
import { hasTerminalAvatarProviderFailure } from "../avatars/provider-availability";
import { countMetric, median, rateMetric, round, simpleRate } from "./metric-math";
import {
  DAY_MS,
  addLocalDays,
  dateKey,
  getDashboardRanges,
  localDayDifference,
  parseDateKey,
  type DashboardRange,
} from "./time-ranges";

export { getDashboardRanges } from "./time-ranges";

const ACTIVATION_DAYS = 7;
const INACTIVITY_DAYS = 14;

export const CREATOR_DASHBOARD_PERIODS = [7, 30, 90] as const;
export type CreatorDashboardDays = (typeof CREATOR_DASHBOARD_PERIODS)[number];
export type CreatorDashboardOptions = {
  days: CreatorDashboardDays;
  timeZone: string;
};

type ActivityBucket = CreatorDashboardSummaryData["activityBuckets"][number];
type Origin = "all" | "access_grant" | "public_link";

export type CreatorDashboardServiceDependencies = {
  repository: CreatorDashboardRepository;
  now?: () => Date;
};

export function createCreatorDashboardService({
  repository,
  now = () => new Date(),
}: CreatorDashboardServiceDependencies) {
  return {
    async getSummary(ownerId: string, options: CreatorDashboardOptions) {
      const currentNow = now();
      const ranges = getDashboardRanges(currentNow, options.days, options.timeZone);
      const data = await repository.getSummaryData(ownerId, {
        activityFrom: ranges.previous.from,
        activityTo: ranges.current.to,
        cohortFrom: new Date(ranges.previous.from.getTime() - ACTIVATION_DAYS * DAY_MS),
        cohortTo: new Date(ranges.current.to.getTime() - ACTIVATION_DAYS * DAY_MS),
        timeZone: options.timeZone,
      });

      return buildCreatorDashboardSummary(data, options, ranges, currentNow);
    },
  };
}

export function buildCreatorDashboardSummary(
  data: CreatorDashboardSummaryData,
  options: CreatorDashboardOptions,
  ranges: ReturnType<typeof getDashboardRanges>,
  currentNow: Date
) {
  const currentRows = rowsWithin(data.activityBuckets, ranges.current);
  const previousRows = rowsWithin(data.activityBuckets, ranges.previous);
  const currentAll = calculateActivity(currentRows);
  const previousAll = calculateActivity(previousRows);
  const currentActivation = calculateActivation(data.grants, ranges.current, currentNow);
  const previousActivation = calculateActivation(data.grants, ranges.previous, currentNow);
  const currentVoice = calculateVoice(data.voiceSessions, ranges.current);
  const previousVoice = calculateVoice(data.voiceSessions, ranges.previous);
  const currentRowsByAvatar = groupBy(currentRows, (row) => row.avatarAgentId);
  const grantsByAvatar = groupBy(data.grants, (grant) => grant.avatarAgentId);
  const avatarsById = new Map(data.avatars.map((avatar) => [avatar.id, avatar]));
  const lastActivityByAvatar = new Map(
    data.avatarLastActivity.map((activity) => [activity.avatarAgentId, activity.lastActivityAt])
  );
  const unavailableAvatarIds = new Set(
    data.avatars
      .filter((avatar) => avatar.status !== "disabled" && hasTerminalAvatarProviderFailure(avatar))
      .map((avatar) => avatar.id)
  );

  const attention = buildAttention(data, avatarsById, unavailableAvatarIds, currentNow);
  const avatarMetrics = data.avatars
    .filter((avatar) => avatar.status !== "disabled" || lastActivityByAvatar.has(avatar.id))
    .map((avatar) => {
      const avatarRows = currentRowsByAvatar.get(avatar.id) ?? [];
      const activity = calculateActivity(avatarRows);
      const activation = calculateActivation(grantsByAvatar.get(avatar.id) ?? [], ranges.current, currentNow);

      return {
        avatarId: avatar.id,
        avatarName: avatar.name,
        status: avatar.status,
        health: avatarHealth(avatar),
        activeParticipants: activity.participants.size,
        engagedConversations: activity.conversations.size,
        returningParticipants: simpleRate(activity.returning, activity.participants.size),
        directAccessActivation: simpleRate(activation.value, activation.total),
        lastActivityAt: lastActivityByAvatar.get(avatar.id)?.toISOString() ?? null,
      };
    })
    .sort(
      (left, right) =>
        right.engagedConversations - left.engagedConversations ||
        right.activeParticipants - left.activeParticipants ||
        left.avatarName.localeCompare(right.avatarName, "es")
    );

  return {
    period: {
      days: options.days,
      timeZone: options.timeZone,
      from: ranges.current.from.toISOString(),
      to: ranges.current.to.toISOString(),
      previousFrom: ranges.previous.from.toISOString(),
      previousTo: ranges.previous.to.toISOString(),
    },
    hasOwnedAvatars: data.avatars.length > 0,
    overview: {
      activeParticipants: countMetric(currentAll.participants.size, previousAll.participants.size),
      engagedConversations: countMetric(currentAll.conversations.size, previousAll.conversations.size),
      returningParticipants: rateMetric(
        currentAll.returning,
        currentAll.participants.size,
        previousAll.returning,
        previousAll.participants.size
      ),
      directAccessActivation: rateMetric(
        currentActivation.value,
        currentActivation.total,
        previousActivation.value,
        previousActivation.total
      ),
    },
    byOrigin: (["all", "access_grant", "public_link"] satisfies Origin[]).map((origin) => {
      const activity = calculateActivity(filterOrigin(currentRows, origin));
      return {
        origin,
        activeParticipants: activity.participants.size,
        engagedConversations: activity.conversations.size,
        returningParticipants: simpleRate(activity.returning, activity.participants.size),
        conversationsPerParticipant:
          activity.participants.size === 0
            ? null
            : round(activity.conversations.size / activity.participants.size, 1),
      };
    }),
    trend: {
      granularity: options.days === 90 ? ("week" as const) : ("day" as const),
      points: buildTrend(currentRows, ranges.current, options.days),
    },
    interaction: {
      conversationMix: simpleRate(currentAll.voiceConversations, currentAll.conversations.size),
      medianVoiceDurationSeconds: currentVoice.medianDurationSeconds,
      medianParticipantTurns: medianParticipantTurns(currentRows),
    },
    voiceHealth: {
      errors: rateMetric(
        currentVoice.errors,
        currentVoice.terminal,
        previousVoice.errors,
        previousVoice.terminal
      ),
    },
    attention: {
      total: attention.total,
      unusedDirectAccesses: attentionGroup(attention.unusedDirectAccesses),
      inactiveParticipants: attentionGroup(attention.inactiveParticipants),
      interruptedInteractions: attentionGroup(
        attention.interruptedInteractions,
        attention.interruptedInteractionCount
      ),
      unavailableAvatars: attentionGroup(attention.unavailableAvatars),
    },
    avatars: avatarMetrics,
    recentActivity: buildRecentActivity(currentRows, avatarsById),
    methodology: {
      activityDefinition: "participant_message_or_activated_voice",
      identity: "normalized_email",
      activationWindowDays: ACTIVATION_DAYS,
      inactivityDays: INACTIVITY_DAYS,
      disclaimer: "Estas métricas describen actividad objetiva y no representan progreso académico.",
    },
  };
}

function rowsWithin(rows: ActivityBucket[], range: DashboardRange) {
  return rows.filter((row) => row.activityDate >= range.fromDate && row.activityDate < range.toDateExclusive);
}

function filterOrigin(rows: ActivityBucket[], origin: Origin) {
  return origin === "all" ? rows : rows.filter((row) => row.origin === origin);
}

function calculateActivity(rows: ActivityBucket[]) {
  const participants = new Map<string, Set<string>>();
  const conversations = new Set<string>();
  const voiceConversations = new Set<string>();

  for (const row of rows) {
    const days = participants.get(row.participantEmail) ?? new Set<string>();
    days.add(row.activityDate);
    participants.set(row.participantEmail, days);
    conversations.add(row.conversationId);
    if (row.mode === "voice") voiceConversations.add(row.conversationId);
  }

  return {
    participants,
    conversations,
    returning: [...participants.values()].filter((days) => days.size >= 2).length,
    voiceConversations: voiceConversations.size,
  };
}

function calculateActivation(
  grants: CreatorDashboardSummaryData["grants"],
  range: DashboardRange,
  now: Date
) {
  const eligible = grants.filter((grant) => {
    const closesAt = grant.createdAt.getTime() + ACTIVATION_DAYS * DAY_MS;
    return closesAt >= range.from.getTime() && closesAt < range.to.getTime() && closesAt <= now.getTime();
  });
  const value = eligible.filter((grant) => {
    if (!grant.firstDirectActivityAt) return false;
    const firstActivity = grant.firstDirectActivityAt.getTime();
    return (
      firstActivity >= grant.createdAt.getTime() &&
      firstActivity < grant.createdAt.getTime() + ACTIVATION_DAYS * DAY_MS
    );
  }).length;
  return { value, total: eligible.length };
}

function calculateVoice(sessions: CreatorDashboardSummaryData["voiceSessions"], range: DashboardRange) {
  const terminal = sessions.filter(
    (session) =>
      session.endedAt &&
      isWithin(session.endedAt, range) &&
      (session.status === "errored" || (session.status === "ended" && session.activatedAt))
  );
  const durations = terminal.flatMap((session) =>
    session.status === "ended" && session.activatedAt && session.endedAt
      ? [Math.max(0, (session.endedAt.getTime() - session.activatedAt.getTime()) / 1_000)]
      : []
  );

  return {
    errors: terminal.filter((session) => session.status === "errored").length,
    terminal: terminal.length,
    medianDurationSeconds: median(durations),
  };
}

function buildAttention(
  data: CreatorDashboardSummaryData,
  avatarsById: Map<string, CreatorDashboardSummaryData["avatars"][number]>,
  unavailableAvatarIds: Set<string>,
  now: Date
) {
  const unusedCutoff = now.getTime() - ACTIVATION_DAYS * DAY_MS;
  const inactiveCutoff = now.getTime() - INACTIVITY_DAYS * DAY_MS;
  const activeGrants = data.grants.filter((grant) => grant.status === "active");
  const unusedDirectAccesses = activeGrants
    .filter((grant) => grant.createdAt.getTime() <= unusedCutoff && !grant.firstDirectActivityAt)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((grant) => ({
      type: "unused_direct_access" as const,
      id: grant.id,
      avatarId: grant.avatarAgentId,
      avatarName: avatarsById.get(grant.avatarAgentId)?.name ?? "Avatar",
      participantKey: createParticipantKey(grant.participantEmail),
      participantName: grant.participantName,
      participantEmail: grant.participantEmail,
      occurredAt: grant.createdAt.toISOString(),
    }));
  const inactiveParticipants = activeGrants
    .filter(
      (grant) =>
        Boolean(grant.latestParticipantActivityAt) &&
        (grant.latestParticipantActivityAt?.getTime() ?? Number.POSITIVE_INFINITY) <= inactiveCutoff
    )
    .sort(
      (left, right) =>
        (left.latestParticipantActivityAt?.getTime() ?? 0) -
        (right.latestParticipantActivityAt?.getTime() ?? 0)
    )
    .map((grant) => ({
      type: "inactive_participant" as const,
      id: grant.id,
      avatarId: grant.avatarAgentId,
      avatarName: avatarsById.get(grant.avatarAgentId)?.name ?? "Avatar",
      participantKey: createParticipantKey(grant.participantEmail),
      participantName: grant.participantName,
      participantEmail: grant.participantEmail,
      occurredAt: grant.latestParticipantActivityAt?.toISOString() ?? grant.createdAt.toISOString(),
    }));
  const interruptedInteractions = data.interruptedConversations.map((conversation) => ({
    type: "interrupted_interaction" as const,
    id: conversation.sessionId,
    avatarId: conversation.avatarAgentId,
    avatarName: avatarsById.get(conversation.avatarAgentId)?.name ?? "Avatar",
    participantKey: createParticipantKey(conversation.participantEmail),
    participantName: conversation.participantName,
    participantEmail: conversation.participantEmail,
    conversationId: conversation.conversationId,
    occurredAt: conversation.startedAt.toISOString(),
  }));
  const interruptedInteractionCount = data.interruptedConversations[0]?.totalCount ?? 0;
  const unavailableAvatars = data.avatars
    .filter((avatar) => unavailableAvatarIds.has(avatar.id))
    .map((avatar) => ({
      type: "unavailable_avatar" as const,
      id: avatar.id,
      avatarId: avatar.id,
      avatarName: avatar.name,
      participantKey: null,
      participantName: null,
      participantEmail: null,
      occurredAt: null,
    }));

  return {
    total:
      unusedDirectAccesses.length +
      inactiveParticipants.length +
      interruptedInteractionCount +
      unavailableAvatars.length,
    unusedDirectAccesses,
    inactiveParticipants,
    interruptedInteractions,
    interruptedInteractionCount,
    unavailableAvatars,
  };
}

function attentionGroup<T>(items: T[], count = items.length) {
  return { count, items: items.slice(0, 5) };
}

function buildTrend(rows: ActivityBucket[], range: DashboardRange, days: CreatorDashboardDays) {
  const dateParts = parseDateKey(range.fromDate);
  const bucketSize = days === 90 ? 7 : 1;
  const buckets = Array.from({ length: Math.ceil(days / bucketSize) }, (_, index) => {
    const startOffset = index * bucketSize;
    const endOffset = Math.min(days, startOffset + bucketSize);
    return {
      date: dateKey(addLocalDays(dateParts, startOffset)),
      dateTo: dateKey(addLocalDays(dateParts, endOffset - 1)),
      conversationIds: new Set<string>(),
      participants: new Set<string>(),
    };
  });

  for (const row of rows) {
    const dayOffset = localDayDifference(range.fromDate, row.activityDate);
    const bucket = buckets[Math.floor(dayOffset / bucketSize)];
    if (!bucket) continue;
    bucket.conversationIds.add(row.conversationId);
    bucket.participants.add(row.participantEmail);
  }

  return buckets.map((bucket) => ({
    date: bucket.date,
    dateTo: bucket.dateTo,
    engagedConversations: bucket.conversationIds.size,
    participants: bucket.participants.size,
  }));
}

function medianParticipantTurns(rows: ActivityBucket[]) {
  const conversations = new Map<string, number>();
  for (const row of rows) {
    conversations.set(
      row.conversationId,
      (conversations.get(row.conversationId) ?? 0) + row.participantTurns
    );
  }
  return median([...conversations.values()].filter((turns) => turns > 0));
}

function buildRecentActivity(
  rows: ActivityBucket[],
  avatarsById: Map<string, CreatorDashboardSummaryData["avatars"][number]>
) {
  const conversations = new Map<string, ActivityBucket>();
  for (const row of rows) {
    const existing = conversations.get(row.conversationId);
    if (!existing || row.lastActivityAt > existing.lastActivityAt) {
      conversations.set(row.conversationId, row);
    }
  }

  return [...conversations.values()]
    .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime())
    .slice(0, 8)
    .map((row) => ({
      conversationId: row.conversationId,
      avatarId: row.avatarAgentId,
      avatarName: avatarsById.get(row.avatarAgentId)?.name ?? "Avatar",
      participantKey: createParticipantKey(row.participantEmail),
      participantName: row.participantName,
      participantEmail: row.participantEmail,
      origin: row.origin,
      mode: row.mode,
      title: row.title,
      occurredAt: row.lastActivityAt.toISOString(),
    }));
}

function avatarHealth(avatar: CreatorDashboardSummaryData["avatars"][number]) {
  if (avatar.status === "disabled") return "disabled" as const;
  if (hasTerminalAvatarProviderFailure(avatar)) return "unavailable" as const;
  if (avatar.status === "draft") return "draft" as const;
  if (avatar.providerSyncStatus === "syncing") return "syncing" as const;
  if (avatar.providerSyncStatus === "not_synced") return "pending" as const;
  return "available" as const;
}

function isWithin(value: Date, range: DashboardRange) {
  return value >= range.from && value < range.to;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const values = grouped.get(key);
    if (values) values.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}
