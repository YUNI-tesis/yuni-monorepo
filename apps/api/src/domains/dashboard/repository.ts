import { createCreatorDashboardRepository, type PrismaClientInstance } from "@yuni/db";

export type CreatorDashboardAvatarRecord = {
  id: string;
  name: string;
  providerSyncStatus: "not_synced" | "synced" | "failed";
};

export type CreatorDashboardGrantRecord = {
  id: string;
  avatarAgentId: string;
  participantEmail: string;
  createdAt: Date;
};

export type CreatorDashboardConversationRecord = {
  id: string;
  avatarAgentId: string;
  participantEmail: string | null;
  mode: "text" | "voice";
  status: "active" | "ended";
  createdAt: Date;
  lastMessageAt: Date | null;
  _count: { messages: number };
  realtimeSessions: Array<{
    id: string;
    status: "connecting" | "active" | "ended" | "errored";
    startedAt: Date;
    endedAt: Date | null;
  }>;
};

export type CreatorDashboardSummaryData = {
  avatars: CreatorDashboardAvatarRecord[];
  grants: CreatorDashboardGrantRecord[];
  conversations: CreatorDashboardConversationRecord[];
};

export type CreatorDashboardRepository = {
  getSummaryData(ownerId: string, sessionsFrom: Date): Promise<CreatorDashboardSummaryData>;
};

export function createCreatorDashboardDataRepository(
  prisma: PrismaClientInstance
): CreatorDashboardRepository {
  return createCreatorDashboardRepository(prisma);
}
