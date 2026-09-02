import {
  NotFoundError,
  type CreateConversationInput,
  type ConversationMode,
  type ConversationStatus,
  type MessageRole,
} from "@yuni/domain";
import type { AvatarsRepository } from "../avatars/repository";

type ConversationSummaryRecord = {
  id: string;
  avatarAgentId: string | null;
  title: string | null;
  mode: ConversationMode;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ConversationMessageRecord = {
  id: string;
  role: MessageRole;
  content: string;
  metadata: unknown | null;
  createdAt: Date;
};

type ConversationDetailRecord = ConversationSummaryRecord & {
  messages: ConversationMessageRecord[];
};

type ConversationIdentityRecord = {
  id: string;
  ownerId: string | null;
  avatarAgentId: string | null;
  accessGrantId: string | null;
};

export type ConversationsServiceDependencies = {
  avatarsRepository: Pick<AvatarsRepository, "findAccessibleForUser">;
  conversationsRepository: {
    createPrivateForParticipant(input: {
      ownerId: string;
      avatarAgentId: string;
      mode: ConversationMode;
      accessGrantId?: string;
      participantEmail?: string;
    }): Promise<ConversationSummaryRecord>;
    listPrivateForAccess(
      ownerId: string,
      avatarAgentId: string,
      accessGrantId: string | null
    ): Promise<ConversationSummaryRecord[]>;
    findLatestPrivateForAccess(
      ownerId: string,
      avatarAgentId: string,
      accessGrantId: string | null
    ): Promise<ConversationSummaryRecord | null>;
    findPrivateIdentityById(conversationId: string): Promise<ConversationIdentityRecord | null>;
    findPrivateByIdForAccess(
      ownerId: string,
      conversationId: string,
      accessGrantId: string | null
    ): Promise<ConversationDetailRecord | null>;
  };
};

export function createConversationsService(dependencies: ConversationsServiceDependencies) {
  return {
    async createAvatarConversation(userId: string, avatarId: string, input: CreateConversationInput) {
      const access = await findAvatarAccess(dependencies, userId, avatarId);
      const conversation = await dependencies.conversationsRepository.createPrivateForParticipant({
        ownerId: userId,
        avatarAgentId: access.avatar.id,
        mode: input.mode,
        ...(access.type === "shared"
          ? {
              accessGrantId: access.accessGrant.id,
              participantEmail: access.accessGrant.participantEmail,
            }
          : {}),
      });

      return toConversationSummaryDto(conversation);
    },

    async listAvatarConversations(userId: string, avatarId: string) {
      const access = await findAvatarAccess(dependencies, userId, avatarId);
      const conversations = await dependencies.conversationsRepository.listPrivateForAccess(
        userId,
        access.avatar.id,
        access.type === "shared" ? access.accessGrant.id : null
      );

      return conversations.map(toConversationSummaryDto);
    },

    async getLatestAvatarConversation(userId: string, avatarId: string) {
      const access = await findAvatarAccess(dependencies, userId, avatarId);
      const conversation = await dependencies.conversationsRepository.findLatestPrivateForAccess(
        userId,
        access.avatar.id,
        access.type === "shared" ? access.accessGrant.id : null
      );

      return conversation ? toConversationSummaryDto(conversation) : null;
    },

    async getConversation(userId: string, conversationId: string) {
      const identity = await dependencies.conversationsRepository.findPrivateIdentityById(conversationId);

      if (!identity || identity.ownerId !== userId) {
        throw new NotFoundError("Conversation not found");
      }

      if (!identity.avatarAgentId) throw new NotFoundError("Conversation not found");
      const access = await findAvatarAccess(dependencies, userId, identity.avatarAgentId);
      const accessGrantId = access.type === "shared" ? access.accessGrant.id : null;

      if (identity.accessGrantId !== accessGrantId) {
        throw new NotFoundError("Conversation not found");
      }

      const conversation = await dependencies.conversationsRepository.findPrivateByIdForAccess(
        userId,
        conversationId,
        accessGrantId
      );

      if (!conversation) throw new NotFoundError("Conversation not found");

      return toConversationDetailDto(conversation);
    },
  };
}

async function findAvatarAccess(
  dependencies: ConversationsServiceDependencies,
  userId: string,
  avatarId: string
) {
  const access = await dependencies.avatarsRepository.findAccessibleForUser(userId, avatarId);

  if (!access) {
    throw new NotFoundError("Avatar not found");
  }

  return access;
}

function toConversationSummaryDto(conversation: ConversationSummaryRecord) {
  return {
    id: conversation.id,
    avatarAgentId: conversation.avatarAgentId,
    title: conversation.title,
    mode: conversation.mode,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function toConversationDetailDto(conversation: ConversationDetailRecord) {
  return {
    ...toConversationSummaryDto(conversation),
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}
