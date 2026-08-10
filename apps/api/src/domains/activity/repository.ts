import { createAvatarActivityRepository, type PrismaClientInstance } from "@yuni/db";

export type ActivityParticipantRecord = {
  id: string;
  participantEmail: string;
  participantUserId: string | null;
  participantName: string | null;
  status: "active" | "revoked";
  createdAt: Date;
  totalConversations: number;
  lastActivityAt: Date | null;
};

export type ActivityConversationRecord = {
  id: string;
  title: string | null;
  mode: "text" | "voice";
  status: "active" | "ended";
  createdAt: Date;
  lastMessageAt: Date | null;
  _count: { messages: number };
};

export type ActivityConversationDetailRecord = Omit<ActivityConversationRecord, "_count"> & {
  accessGrant: { participantEmail: string } | null;
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
    accessGrantId: string,
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
