import { LiveAvatarConfigSchema, VoiceConfigSchema } from "@yuni/domain";
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

type AvatarActivityBucket = CreatorDashboardSummaryData["activityBuckets"][number];
type GroupActivityBucket = CreatorDashboardSummaryData["groupActivityBuckets"][number];
type ActivityBucket =
  | (AvatarActivityBucket & {
      resourceKind: "avatar";
      resourceId: string;
      resourceName: string;
    })
  | (GroupActivityBucket & {
      resourceKind: "group";
      resourceId: string;
      resourceName: string;
      avatarAgentId: null;
    });
type Origin = "all" | "access_grant" | "public_link";
type DashboardGrant = {
  id: string;
  participantEmail: string;
  participantName: string | null;
  status: "active" | "revoked";
  createdAt: Date;
  firstDirectActivityAt: Date | null;
  latestParticipantActivityAt: Date | null;
  resourceKind: "avatar" | "group";
  resourceId: string;
  resourceName: string;
};
type DashboardVoiceSession = {
  status: "connecting" | "active" | "ended" | "errored";
  activatedAt: Date | null;
  endedAt: Date | null;
};

export type CreatorDashboardServiceDependencies = {
  repository: CreatorDashboardRepository;
  now?: () => Date;
  groupAnalyticsEnabled?: boolean;
};

export function createCreatorDashboardService({
  repository,
  now = () => new Date(),
  groupAnalyticsEnabled = false,
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
        includeGroupAnalytics: groupAnalyticsEnabled,
      });

      return buildCreatorDashboardSummary(data, options, ranges, currentNow, groupAnalyticsEnabled);
    },
  };
}

export function buildCreatorDashboardSummary(
  data: CreatorDashboardSummaryData,
  options: CreatorDashboardOptions,
  ranges: ReturnType<typeof getDashboardRanges>,
  currentNow: Date,
  groupAnalyticsEnabled = false
) {
  const activityRows: ActivityBucket[] = [
    ...data.activityBuckets.map((row) => ({
      ...row,
      resourceKind: "avatar" as const,
      resourceId: row.avatarAgentId,
      resourceName: data.avatars.find((avatar) => avatar.id === row.avatarAgentId)?.name ?? "Avatar",
    })),
    ...(groupAnalyticsEnabled
      ? collapseGroupActivityRows(data.groupActivityBuckets).map((row) => ({
          ...row,
          avatarAgentId: null,
          resourceKind: "group" as const,
          resourceId: row.avatarGroupId,
          resourceName: row.avatarGroupName,
        }))
      : []),
  ];
  const currentRows = rowsWithin(activityRows, ranges.current);
  const previousRows = rowsWithin(activityRows, ranges.previous);
  const currentAll = calculateActivity(currentRows);
  const previousAll = calculateActivity(previousRows);
  const allGrants: DashboardGrant[] = [
    ...data.grants.map((grant) => ({
      ...grant,
      resourceKind: "avatar" as const,
      resourceId: grant.avatarAgentId,
      resourceName: data.avatars.find((avatar) => avatar.id === grant.avatarAgentId)?.name ?? "Avatar",
    })),
    ...(groupAnalyticsEnabled
      ? data.groupGrants.map((grant) => ({
          ...grant,
          avatarAgentId: null,
          resourceKind: "group" as const,
          resourceId: grant.avatarGroupId,
          resourceName: grant.avatarGroupName,
        }))
      : []),
  ];
  const currentActivation = calculateActivation(allGrants, ranges.current, currentNow);
  const previousActivation = calculateActivation(allGrants, ranges.previous, currentNow);
  const allVoiceSessions = [
    ...data.voiceSessions.map((session) => ({ ...session, resourceKind: "avatar" as const })),
    ...(groupAnalyticsEnabled
      ? data.groupVoiceSessions
          .filter((session) => session.activatedAt)
          .map((session) => ({ ...session, resourceKind: "group" as const }))
      : []),
  ];
  const currentVoice = calculateVoice(allVoiceSessions, ranges.current);
  const previousVoice = calculateVoice(allVoiceSessions, ranges.previous);
  const currentRowsByAvatar = groupBy(
    currentRows.filter((row) => row.resourceKind === "avatar"),
    (row) => row.resourceId
  );
  const grantsByAvatar = groupBy(data.grants, (grant) => grant.avatarAgentId);
  const currentRowsByGroup = groupBy(
    currentRows.filter((row) => row.resourceKind === "group"),
    (row) => row.resourceId
  );
  const grantsByGroup = groupBy(data.groupGrants, (grant) => grant.avatarGroupId);
  const avatarsById = new Map(data.avatars.map((avatar) => [avatar.id, avatar]));
  const lastActivityByAvatar = new Map(
    data.avatarLastActivity.map((activity) => [activity.avatarAgentId, activity.lastActivityAt])
  );
  const lastActivityByGroup = new Map(
    data.groupLastActivity.map((activity) => [activity.avatarGroupId, activity.lastActivityAt])
  );
  const unavailableAvatarIds = new Set(
    data.avatars
      .filter((avatar) => avatar.status !== "disabled" && hasTerminalAvatarProviderFailure(avatar))
      .map((avatar) => avatar.id)
  );

  const unavailableGroupIds = new Set(
    groupAnalyticsEnabled
      ? data.groups.filter((group) => groupHealth(group) === "unavailable").map((group) => group.id)
      : []
  );

  const attention = buildAttention(
    data,
    allGrants,
    avatarsById,
    unavailableAvatarIds,
    unavailableGroupIds,
    currentNow,
    groupAnalyticsEnabled
  );
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

  const groupMetrics = groupAnalyticsEnabled
    ? data.groups
        .filter((group) => !group.deletedAt || lastActivityByGroup.has(group.id))
        .map((group) => {
          const groupRows = currentRowsByGroup.get(group.id) ?? [];
          const activity = calculateActivity(groupRows);
          const activation = calculateActivation(
            grantsByGroup.get(group.id) ?? [],
            ranges.current,
            currentNow
          );
          return {
            groupId: group.id,
            groupName: group.name,
            status: group.deletedAt ? ("deleted" as const) : ("active" as const),
            health: groupHealth(group),
            activeParticipants: activity.participants.size,
            engagedConversations: activity.conversations.size,
            returningParticipants: simpleRate(activity.returning, activity.participants.size),
            directAccessActivation: simpleRate(activation.value, activation.total),
            lastActivityAt: lastActivityByGroup.get(group.id)?.toISOString() ?? null,
          };
        })
        .sort(
          (left, right) =>
            right.engagedConversations - left.engagedConversations ||
            right.activeParticipants - left.activeParticipants ||
            left.groupName.localeCompare(right.groupName, "es")
        )
    : [];

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
    ...(groupAnalyticsEnabled
      ? { hasOwnedResources: data.avatars.length > 0 || data.groups.length > 0 }
      : {}),
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
      ...(groupAnalyticsEnabled ? { unavailableGroups: attentionGroup(attention.unavailableGroups) } : {}),
    },
    avatars: avatarMetrics,
    ...(groupAnalyticsEnabled ? { groups: groupMetrics } : {}),
    recentActivity: buildRecentActivity(currentRows, avatarsById, groupAnalyticsEnabled),
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

function collapseGroupActivityRows(rows: GroupActivityBucket[]) {
  const conversations = new Map<string, GroupActivityBucket>();
  for (const row of rows) {
    const current = conversations.get(row.conversationId);
    if (!current) {
      conversations.set(row.conversationId, row);
      continue;
    }
    const latest = row.lastActivityAt > current.lastActivityAt ? row : current;
    conversations.set(row.conversationId, {
      ...latest,
      participantTurns: current.participantTurns + row.participantTurns,
    });
  }
  return [...conversations.values()];
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
  grants: Array<Pick<DashboardGrant, "createdAt" | "firstDirectActivityAt">>,
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

function calculateVoice(sessions: DashboardVoiceSession[], range: DashboardRange) {
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
  grants: DashboardGrant[],
  avatarsById: Map<string, CreatorDashboardSummaryData["avatars"][number]>,
  unavailableAvatarIds: Set<string>,
  unavailableGroupIds: Set<string>,
  now: Date,
  groupAnalyticsEnabled: boolean
) {
  const unusedCutoff = now.getTime() - ACTIVATION_DAYS * DAY_MS;
  const inactiveCutoff = now.getTime() - INACTIVITY_DAYS * DAY_MS;
  const activeGrants = grants.filter((grant) => grant.status === "active");
  const unusedDirectAccesses = activeGrants
    .filter((grant) => grant.createdAt.getTime() <= unusedCutoff && !grant.firstDirectActivityAt)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((grant) => ({
      type: "unused_direct_access" as const,
      id: grant.id,
      ...resourceFields(grant, groupAnalyticsEnabled),
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
      ...resourceFields(grant, groupAnalyticsEnabled),
      participantKey: createParticipantKey(grant.participantEmail),
      participantName: grant.participantName,
      participantEmail: grant.participantEmail,
      occurredAt: grant.latestParticipantActivityAt?.toISOString() ?? grant.createdAt.toISOString(),
    }));
  const interruptedInteractions = [
    ...data.interruptedConversations.map((conversation) => ({
      type: "interrupted_interaction" as const,
      id: conversation.sessionId,
      ...resourceFields(
        {
          resourceKind: "avatar",
          resourceId: conversation.avatarAgentId,
          resourceName: avatarsById.get(conversation.avatarAgentId)?.name ?? "Avatar",
        },
        groupAnalyticsEnabled
      ),
      participantKey: createParticipantKey(conversation.participantEmail),
      participantName: conversation.participantName,
      participantEmail: conversation.participantEmail,
      conversationId: conversation.conversationId,
      occurredAt: conversation.startedAt.toISOString(),
    })),
    ...(groupAnalyticsEnabled
      ? data.interruptedGroupConversations.map((conversation) => ({
          type: "interrupted_interaction" as const,
          id: conversation.sessionId,
          ...resourceFields(
            {
              resourceKind: "group",
              resourceId: conversation.avatarGroupId,
              resourceName: conversation.avatarGroupName,
            },
            true
          ),
          participantKey: createParticipantKey(conversation.participantEmail),
          participantName: conversation.participantName,
          participantEmail: conversation.participantEmail,
          conversationId: conversation.conversationId,
          occurredAt: conversation.startedAt.toISOString(),
        }))
      : []),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const interruptedInteractionCount =
    (data.interruptedConversations[0]?.totalCount ?? 0) +
    (groupAnalyticsEnabled ? (data.interruptedGroupConversations[0]?.totalCount ?? 0) : 0);
  const unavailableAvatars = data.avatars
    .filter((avatar) => unavailableAvatarIds.has(avatar.id))
    .map((avatar) => ({
      type: "unavailable_avatar" as const,
      id: avatar.id,
      ...resourceFields(
        { resourceKind: "avatar", resourceId: avatar.id, resourceName: avatar.name },
        groupAnalyticsEnabled
      ),
      participantKey: null,
      participantName: null,
      participantEmail: null,
      occurredAt: null,
    }));
  const unavailableGroups = groupAnalyticsEnabled
    ? data.groups
        .filter((group) => unavailableGroupIds.has(group.id))
        .map((group) => ({
          type: "unavailable_group" as const,
          id: group.id,
          ...resourceFields({ resourceKind: "group", resourceId: group.id, resourceName: group.name }, true),
          participantKey: null,
          participantName: null,
          participantEmail: null,
          occurredAt: null,
        }))
    : [];

  return {
    total:
      unusedDirectAccesses.length +
      inactiveParticipants.length +
      interruptedInteractionCount +
      unavailableAvatars.length +
      unavailableGroups.length,
    unusedDirectAccesses,
    inactiveParticipants,
    interruptedInteractions,
    interruptedInteractionCount,
    unavailableAvatars,
    unavailableGroups,
  };
}

function resourceFields(
  resource: { resourceKind: "avatar" | "group"; resourceId: string; resourceName: string },
  groupAnalyticsEnabled: boolean
) {
  if (!groupAnalyticsEnabled) {
    return { avatarId: resource.resourceId, avatarName: resource.resourceName };
  }
  return resource.resourceKind === "avatar"
    ? {
        resourceKind: "avatar" as const,
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        resource: { type: "avatar" as const, id: resource.resourceId, name: resource.resourceName },
        avatarId: resource.resourceId,
        avatarName: resource.resourceName,
      }
    : {
        resourceKind: "group" as const,
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        resource: { type: "group" as const, id: resource.resourceId, name: resource.resourceName },
        groupId: resource.resourceId,
        groupName: resource.resourceName,
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
  avatarsById: Map<string, CreatorDashboardSummaryData["avatars"][number]>,
  groupAnalyticsEnabled: boolean
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
      ...resourceFields(
        row.resourceKind === "avatar"
          ? {
              resourceKind: "avatar" as const,
              resourceId: row.resourceId,
              resourceName: avatarsById.get(row.resourceId)?.name ?? row.resourceName,
            }
          : {
              resourceKind: "group" as const,
              resourceId: row.resourceId,
              resourceName: row.resourceName,
            },
        groupAnalyticsEnabled
      ),
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

function groupHealth(group: CreatorDashboardSummaryData["groups"][number]) {
  if (group.deletedAt) return "deleted" as const;
  if (group.members.length < 2 || group.members.length > 3) return "unavailable" as const;
  const ready = group.members.every(
    ({ accessGrantId, avatarAgent }) =>
      accessGrantId === null &&
      avatarAgent.ownerId === group.ownerId &&
      avatarAgent.status === "active" &&
      Boolean(avatarAgent.groupProviderAgentId) &&
      avatarAgent.groupProviderSyncStatus === "synced" &&
      LiveAvatarConfigSchema.safeParse(avatarAgent.liveAvatarConfig).success &&
      VoiceConfigSchema.safeParse(avatarAgent.voiceConfig).success
  );
  return ready ? ("available" as const) : ("unavailable" as const);
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
