import { NotFoundError, OwnershipError } from "@yuni/domain";
import { createHash } from "node:crypto";
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
            participantKey: createParticipantKey(participant.participantEmail),
            participantEmail: participant.participantEmail,
            participantName: participant.participantName,
            origins: participant.origins,
            accessState:
              participant.grantStatus === null
                ? null
                : participant.grantStatus === "revoked"
                  ? ("revoked" as const)
                  : participant.participantUserId
                    ? ("linked" as const)
                    : ("pending" as const),
            totalConversations: participant.totalConversations,
            lastActivityAt: participant.lastActivityAt?.toISOString() ?? null,
            sortCreatedAt: participant.grantCreatedAt,
          }))
          .sort((left, right) => {
            const activityDifference =
              (right.lastActivityAt ? new Date(right.lastActivityAt).getTime() : 0) -
              (left.lastActivityAt ? new Date(left.lastActivityAt).getTime() : 0);
            return (
              activityDifference ||
              (right.sortCreatedAt?.getTime() ?? 0) - (left.sortCreatedAt?.getTime() ?? 0)
            );
          })
          .map(({ sortCreatedAt: _sortCreatedAt, ...participant }) => participant);
      } catch (error) {
        throw normalizeActivityError(error, "Avatar not found");
      }
    },

    async listConversations(
      ownerId: string,
      avatarId: string,
      participantKey: string,
      options: { limit: number; cursor?: string }
    ) {
      try {
        const participant = await resolveParticipant(repository, ownerId, avatarId, participantKey);
        const result = await repository.listConversations(
          ownerId,
          avatarId,
          participant.participantEmail,
          options
        );
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
        if (!conversation?.participantEmail) throw new NotFoundError("Activity conversation not found");

        return {
          id: conversation.id,
          title: conversation.title,
          mode: conversation.mode,
          status: conversation.status,
          createdAt: conversation.createdAt.toISOString(),
          lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
          participantEmail: conversation.participantEmail,
          origin: conversation.visibility === "public" ? "public_link" : "access_grant",
          shareLinkName: conversation.visibility === "public" ? (conversation.shareLink?.name ?? null) : null,
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
    origin: conversation.visibility === "public" ? "public_link" : "access_grant",
    shareLinkName: conversation.visibility === "public" ? (conversation.shareLink?.name ?? null) : null,
  };
}

type ActivityConversationRecordLike = {
  id: string;
  title: string | null;
  mode: "text" | "voice";
  status: "active" | "ended";
  createdAt: Date;
  lastMessageAt: Date | null;
  visibility: "private" | "public";
  shareLink: { name: string } | null;
  _count: { messages: number };
};

function normalizeActivityError(error: unknown, message: string): Error {
  if (error instanceof OwnershipError) return new NotFoundError(message);
  return error instanceof Error ? error : new Error("Unknown activity error");
}

export function createParticipantKey(email: string) {
  return `p_${createHash("sha256").update(email.trim().toLowerCase()).digest("base64url")}`;
}

async function resolveParticipant(
  repository: AvatarActivityRepository,
  ownerId: string,
  avatarId: string,
  participantKey: string
) {
  const participants = await repository.listParticipants(ownerId, avatarId);
  const participant = participants.find(
    (item) => createParticipantKey(item.participantEmail) === participantKey
  );
  if (!participant) throw new NotFoundError("Activity participant not found");
  return participant;
}
