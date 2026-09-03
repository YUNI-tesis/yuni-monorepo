import { apiRequest } from "./http-client";

export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type ApiDashboardDays = (typeof DASHBOARD_PERIODS)[number];
export type ApiDashboardOrigin = "all" | "access_grant" | "public_link";

export type ApiDashboardCountMetric = {
  value: number;
  previous: number;
  changePercent: number | null;
};

export type ApiDashboardRateMetric = {
  value: number;
  total: number;
  rate: number | null;
  previousValue: number;
  previousTotal: number;
  previousRate: number | null;
  changePercentagePoints: number | null;
};

export type ApiDashboardSimpleRate = {
  value: number;
  total: number;
  rate: number | null;
};

export type ApiDashboardAttentionType =
  | "unused_direct_access"
  | "inactive_participant"
  | "interrupted_interaction"
  | "unavailable_avatar"
  | "unavailable_group";

export type ApiDashboardAvatarResource = {
  resourceKind?: "avatar";
  resourceId?: string;
  resourceName?: string;
  resource?: { type: "avatar"; id: string; name: string };
  avatarId: string;
  avatarName: string;
  groupId?: never;
  groupName?: never;
};

export type ApiDashboardGroupResource = {
  resourceKind: "group";
  resourceId: string;
  resourceName: string;
  resource: { type: "group"; id: string; name: string };
  groupId: string;
  groupName: string;
  avatarId?: never;
  avatarName?: never;
};

export type ApiDashboardResource = ApiDashboardAvatarResource | ApiDashboardGroupResource;

export type ApiDashboardAttentionItem = ApiDashboardResource & {
  type: ApiDashboardAttentionType;
  id: string;
  participantKey: string | null;
  participantName: string | null;
  participantEmail: string | null;
  conversationId?: string;
  occurredAt: string | null;
};

export type ApiDashboardAttentionGroup = {
  count: number;
  items: ApiDashboardAttentionItem[];
};

export type ApiCreatorDashboardSummary = {
  period: {
    days: ApiDashboardDays;
    timeZone: string;
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  hasOwnedAvatars: boolean;
  hasOwnedResources?: boolean;
  overview: {
    activeParticipants: ApiDashboardCountMetric;
    engagedConversations: ApiDashboardCountMetric;
    returningParticipants: ApiDashboardRateMetric;
    directAccessActivation: ApiDashboardRateMetric;
  };
  byOrigin: Array<{
    origin: ApiDashboardOrigin;
    activeParticipants: number;
    engagedConversations: number;
    returningParticipants: ApiDashboardSimpleRate;
    conversationsPerParticipant: number | null;
  }>;
  trend: {
    granularity: "day" | "week";
    points: Array<{
      date: string;
      dateTo: string;
      engagedConversations: number;
      participants: number;
    }>;
  };
  interaction: {
    conversationMix: ApiDashboardSimpleRate;
    medianVoiceDurationSeconds: number | null;
    medianParticipantTurns: number | null;
  };
  voiceHealth: { errors: ApiDashboardRateMetric };
  attention: {
    total: number;
    unusedDirectAccesses: ApiDashboardAttentionGroup;
    inactiveParticipants: ApiDashboardAttentionGroup;
    interruptedInteractions: ApiDashboardAttentionGroup;
    unavailableAvatars: ApiDashboardAttentionGroup;
    unavailableGroups?: ApiDashboardAttentionGroup;
  };
  avatars: Array<{
    avatarId: string;
    avatarName: string;
    status: "draft" | "active" | "disabled";
    health: "available" | "unavailable" | "disabled" | "draft" | "syncing" | "pending";
    activeParticipants: number;
    engagedConversations: number;
    returningParticipants: ApiDashboardSimpleRate;
    directAccessActivation: ApiDashboardSimpleRate;
    lastActivityAt: string | null;
  }>;
  groups?: Array<{
    groupId: string;
    groupName: string;
    status: "active" | "deleted";
    health: "available" | "unavailable" | "deleted";
    activeParticipants: number;
    engagedConversations: number;
    returningParticipants: ApiDashboardSimpleRate;
    directAccessActivation: ApiDashboardSimpleRate;
    lastActivityAt: string | null;
  }>;
  recentActivity: Array<
    ApiDashboardResource & {
      conversationId: string;
      participantKey: string;
      participantName: string | null;
      participantEmail: string;
      origin: Exclude<ApiDashboardOrigin, "all">;
      mode: "text" | "voice";
      title: string | null;
      occurredAt: string;
    }
  >;
  methodology: {
    activityDefinition: "participant_message_or_activated_voice";
    identity: "normalized_email";
    activationWindowDays: number;
    inactivityDays: number;
    disclaimer: string;
  };
};

export function getCreatorDashboardSummary(
  options: {
    days?: ApiDashboardDays;
    timeZone?: string;
    signal?: AbortSignal;
  } = {}
) {
  const query = new URLSearchParams();
  query.set("days", String(options.days ?? 30));
  query.set("timeZone", options.timeZone ?? "UTC");
  return apiRequest<ApiCreatorDashboardSummary>(
    `/dashboard/creator-summary?${query}`,
    options.signal ? { signal: options.signal } : {}
  );
}
