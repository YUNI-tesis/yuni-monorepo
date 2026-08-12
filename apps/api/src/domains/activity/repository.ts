import { createAvatarActivityRepository, type PrismaClientInstance } from "@yuni/db";

export type ActivityParticipantRecord = {
  participantEmail: string;
  participantUserId: string | null;
  participantName: string | null;
  grantStatus: "active" | "revoked" | null;
  grantCreatedAt: Date | null;
  origins: Array<"access_grant" | "public_link">;
  totalConversations: number;
  lastActivityAt: Date | null;
};

export type ActivityConversationRecord = {
  id: string;
  title: string | null;
  mode: "text" | "voice";
  status: "active" | "ended";
  visibility: "private" | "public";
  createdAt: Date;
  lastMessageAt: Date | null;
  shareLink: { name: string } | null;
  _count: { messages: number };
};

export type ActivityConversationDetailRecord = Omit<ActivityConversationRecord, "_count"> & {
  participantEmail: string | null;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: Date;
  }>;
};

export type AvatarActivityRepository = {
  listParticipants(ownerId: string, avatarId: string): Promise<ActivityParticipantRecord[]>;
  listConversations(
    ownerId: string,
    avatarId: string,
    participantEmail: string,
    options: { limit: number; cursor?: string }
  ): Promise<{ invalidCursor: boolean; conversations: ActivityConversationRecord[] }>;
  findConversation(
    ownerId: string,
    avatarId: string,
    conversationId: string
  ): Promise<ActivityConversationDetailRecord | null>;
};

export function createAvatarActivityDataRepository(prisma: PrismaClientInstance): AvatarActivityRepository {
  return createAvatarActivityRepository(prisma);
}
