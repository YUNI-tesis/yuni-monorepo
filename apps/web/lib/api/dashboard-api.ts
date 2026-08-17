import { apiRequest } from "./http-client";

export type ApiDashboardCountMetric = {
  value: number;
  previous: number;
  changePercent: number | null;
};

export type ApiDashboardRateMetric = {
  value: number;
  total: number;
  rate: number | null;
  previousRate: number | null;
  changePercentagePoints: number | null;
};

export type ApiDashboardAttentionType =
  | "never_used_access"
  | "inactive_participant"
  | "errored_session"
  | "failed_avatar";

export type ApiDashboardAttentionItem = {
  type: ApiDashboardAttentionType;
  id: string;
  avatarId: string;
  avatarName: string;
  participantKey: string | null;
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
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
  };
  hasOwnedAvatars: boolean;
  overview: {
    activeParticipants: ApiDashboardCountMetric;
    conversations: ApiDashboardCountMetric;
    recurringParticipants: ApiDashboardRateMetric;
    completedSessions: ApiDashboardRateMetric;
    medianVoiceDurationSeconds: number | null;
    medianParticipantTurns: number | null;
  };
  trend: Array<{
    date: string;
    conversations: number;
    participants: number;
  }>;
  attention: {
    total: number;
    neverUsedAccesses: ApiDashboardAttentionGroup;
    inactiveParticipants: ApiDashboardAttentionGroup;
    erroredSessions: ApiDashboardAttentionGroup;
    failedAvatars: ApiDashboardAttentionGroup;
  };
  avatars: Array<{
    avatarId: string;
    avatarName: string;
    activeParticipants: number;
    conversations: number;
    recurringRate: number | null;
    medianVoiceDurationSeconds: number | null;
    lastActivityAt: string | null;
    attentionCount: number;
  }>;
  recentActivity: Array<{
    conversationId: string;
    avatarId: string;
    avatarName: string;
    participantKey: string;
    participantEmail: string;
    mode: "text" | "voice";
    status: "active" | "ended";
    occurredAt: string;
  }>;
};

export function getCreatorDashboardSummary(options: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  const suffix = query.size > 0 ? `?${query}` : "";
  return apiRequest<ApiCreatorDashboardSummary>(`/dashboard/creator-summary${suffix}`);
}
