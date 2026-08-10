import { NotFoundError, OwnershipError } from "@yuni/domain";
import type { AvatarActivityRepository } from "./repository";

export class InvalidActivityCursorError extends Error {
  constructor() {
    super("Invalid activity cursor");
    this.name = "InvalidActivityCursorError";
  }
}

export type AvatarActivityServiceDependencies = {
  repository: AvatarActivityRepository;
};

export function createAvatarActivityService({ repository }: AvatarActivityServiceDependencies) {
  return {
    async listParticipants(ownerId: string, avatarId: string) {
      try {
        const participants = await repository.listParticipants(ownerId, avatarId);

        return participants
          .map((participant) => ({
            accessGrantId: participant.id,
            participantEmail: participant.participantEmail,
            participantName: participant.participantName,
            state:
              participant.status === "revoked"
                ? ("revoked" as const)
                : participant.participantUserId
                  ? ("linked" as const)
                  : ("pending" as const),
            totalConversations: participant.totalConversations,
            lastActivityAt: participant.lastActivityAt?.toISOString() ?? null,
            grantCreatedAt: participant.createdAt,
          }))
          .sort((left, right) => {
            const activityDifference =
              (right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0) -
              (left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0);
            return activityDifference || right.grantCreatedAt.getTime() - left.grantCreatedAt.getTime();
          })
          .map(({ grantCreatedAt: _grantCreatedAt, ...participant }) => participant);
      } catch (error) {
        throw normalizeActivityError(error, "Avatar not found");
      }
    },

    async listConversations(
      ownerId: string,
      avatarId: string,
      accessGrantId: string,
      options: { limit: number; cursor?: string }
    ) {
      try {
        const result = await repository.listConversations(ownerId, avatarId, accessGrantId, options);
        if (result.invalidCursor) throw new InvalidActivityCursorError();

        const hasMore = result.conversations.length > options.limit;
        const page = result.conversations.slice(0, options.limit);

        return {
          conversations: page.map(toConversationSummaryDto),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        };
      } catch (error) {
        if (error instanceof InvalidActivityCursorError) throw error;
        throw normalizeActivityError(error, "Activity participant not found");
      }
    },

    async getConversation(ownerId: string, avatarId: string, conversationId: string) {
      try {
        const conversation = await repository.findConversation(ownerId, avatarId, conversationId);
        if (!conversation?.accessGrant) throw new NotFoundError("Activity conversation not found");

        return {
          id: conversation.id,
          title: conversation.title,
          mode: conversation.mode,
          status: conversation.status,
          createdAt: conversation.createdAt.toISOString(),
          lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
          participantEmail: conversation.accessGrant.participantEmail,
          messages: conversation.messages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({
              id: message.id,
              role: message.role as "user" | "assistant",
              content: message.content,
              createdAt: message.createdAt.toISOString(),
            })),
        };
      } catch (error) {
        throw normalizeActivityError(error, "Activity conversation not found");
      }
    },
  };
}

function toConversationSummaryDto(conversation: ActivityConversationRecordLike) {
  return {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    status: conversation.status,
    messageCount: conversation._count.messages,
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
  };
}

type ActivityConversationRecordLike = {
  id: string;
  title: string | null;
  mode: "text" | "voice";
  status: "active" | "ended";
  createdAt: Date;
  lastMessageAt: Date | null;
  _count: { messages: number };
};

function normalizeActivityError(error: unknown, message: string): Error {
  if (error instanceof OwnershipError) return new NotFoundError(message);
  return error instanceof Error ? error : new Error("Unknown activity error");
}
