import { NotFoundError, OwnershipError } from "@yuni/domain";
import { createParticipantKey, InvalidActivityCursorError } from "./service";
import type { AvatarGroupActivityRepository } from "./group-repository";

export type AvatarGroupActivityServiceDependencies = {
  repository: AvatarGroupActivityRepository;
};

export function createAvatarGroupActivityService({ repository }: AvatarGroupActivityServiceDependencies) {
  return {
    async listParticipants(ownerId: string, groupId: string) {
      try {
        const result = await repository.listParticipants(ownerId, groupId);
        return {
          group: {
            id: result.group.id,
            name: result.group.name,
            archived: result.group.deletedAt !== null,
          },
          participants: result.participants
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
            .map(({ sortCreatedAt: _sortCreatedAt, ...participant }) => participant),
        };
      } catch (error) {
        throw normalizeGroupActivityError(error, "Group not found");
      }
    },

    async listConversations(
      ownerId: string,
      groupId: string,
      participantKey: string,
      options: { limit: number; cursor?: string }
    ) {
      try {
        const participant = await resolveParticipant(repository, ownerId, groupId, participantKey);
        const result = await repository.listConversations(
          ownerId,
          groupId,
          participant.participantEmail,
          options
        );
        if (result.invalidCursor) throw new InvalidActivityCursorError();

        const hasMore = result.conversations.length > options.limit;
        const page = result.conversations.slice(0, options.limit);
        return {
          conversations: page.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            mode: conversation.mode,
            status: conversation.status,
            messageCount: conversation._count.messages,
            createdAt: conversation.createdAt.toISOString(),
            lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
            origin:
              conversation.visibility === "public" ? ("public_link" as const) : ("access_grant" as const),
            shareLinkName:
              conversation.visibility === "public" ? (conversation.groupShareLink?.name ?? null) : null,
            resourceKind: "group" as const,
            groupId,
            groupName: conversation.avatarGroupNameSnapshot ?? result.group.name,
            roster: resolveRoster(
              conversation.groupParticipantSnapshots,
              conversation.avatarGroupRosterSnapshot
            ),
            ...voiceTiming(conversation.groupVoiceSession),
          })),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        };
      } catch (error) {
        if (error instanceof InvalidActivityCursorError) throw error;
        throw normalizeGroupActivityError(error, "Activity participant not found");
      }
    },

    async getConversation(ownerId: string, groupId: string, conversationId: string) {
      try {
        const conversation = await repository.findConversation(ownerId, groupId, conversationId);
        if (!conversation?.participantEmail) {
          throw new NotFoundError("Activity conversation not found");
        }
        const roster = resolveRoster(
          conversation.groupParticipantSnapshots,
          conversation.avatarGroupRosterSnapshot
        );
        const namesByAvatarId = new Map(roster.map((member) => [member.id, member.name]));

        return {
          id: conversation.id,
          title: conversation.title,
          mode: conversation.mode,
          status: conversation.status,
          createdAt: conversation.createdAt.toISOString(),
          lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
          participantEmail: conversation.participantEmail,
          origin: conversation.visibility === "public" ? ("public_link" as const) : ("access_grant" as const),
          shareLinkName:
            conversation.visibility === "public" ? (conversation.groupShareLink?.name ?? null) : null,
          resourceKind: "group" as const,
          groupId,
          groupName: conversation.avatarGroupNameSnapshot ?? conversation.group.name,
          roster,
          ...voiceTiming(conversation.groupVoiceSession),
          messages: conversation.messages.map((message) => {
            const speakerAvatarId =
              message.groupParticipantSnapshot?.sourceAvatarId ?? message.speakerAvatarId;
            return {
              id: message.id,
              role: message.role as "user" | "assistant",
              content: message.content,
              speakerAvatarId,
              speakerName:
                message.groupParticipantSnapshot?.name ??
                (speakerAvatarId ? (namesByAvatarId.get(speakerAvatarId) ?? null) : null),
              createdAt: message.createdAt.toISOString(),
            };
          }),
        };
      } catch (error) {
        throw normalizeGroupActivityError(error, "Activity conversation not found");
      }
    },
  };
}

function parseRosterSnapshot(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((member, fallbackPosition) => {
    if (!member || typeof member !== "object") return [];
    const record = member as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    const name = typeof record.name === "string" ? record.name : null;
    const position =
      typeof record.position === "number" && Number.isInteger(record.position)
        ? record.position
        : fallbackPosition;
    return id && name ? [{ id, name, position }] : [];
  });
}

function resolveRoster(
  snapshots: Array<{ sourceAvatarId: string; name: string; position: number }> | undefined,
  legacySnapshot: unknown
) {
  if (snapshots?.length) {
    return snapshots.map((member) => ({
      id: member.sourceAvatarId,
      name: member.name,
      position: member.position,
    }));
  }
  return parseRosterSnapshot(legacySnapshot);
}

function voiceTiming(session: { activatedAt: Date | null; endedAt: Date | null } | null) {
  const activatedAt = session?.activatedAt ?? null;
  const endedAt = session?.endedAt ?? null;
  return {
    activatedAt: activatedAt?.toISOString() ?? null,
    endedAt: endedAt?.toISOString() ?? null,
    durationSeconds:
      activatedAt && endedAt
        ? Math.max(0, Math.round((endedAt.getTime() - activatedAt.getTime()) / 1_000))
        : null,
  };
}

function normalizeGroupActivityError(error: unknown, message: string): Error {
  if (error instanceof OwnershipError) return new NotFoundError(message);
  return error instanceof Error ? error : new Error("Unknown group activity error");
}

async function resolveParticipant(
  repository: AvatarGroupActivityRepository,
  ownerId: string,
  groupId: string,
  participantKey: string
) {
  const result = await repository.listParticipants(ownerId, groupId);
  const participant = result.participants.find(
    (item) => createParticipantKey(item.participantEmail) === participantKey
  );
  if (!participant) throw new NotFoundError("Activity participant not found");
  return participant;
}
