import {
  NotFoundError,
  type ConversationMode,
  type ConversationStatus,
  type MessageRole,
} from "@yuni/domain";
import type { AvatarsRepository } from "../avatars/repository";

type ConversationSummaryRecord = {
  id: string;
  avatarAgentId: string;
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

export type ConversationsServiceDependencies = {
  avatarsRepository: Pick<AvatarsRepository, "findByIdForOwner">;
  conversationsRepository: {
    listPrivateForAvatar(ownerId: string, avatarAgentId: string): Promise<ConversationSummaryRecord[]>;
    findPrivateById(ownerId: string, conversationId: string): Promise<ConversationDetailRecord | null>;
  };
};

export function createConversationsService(dependencies: ConversationsServiceDependencies) {
  return {
    async listAvatarConversations(ownerId: string, avatarId: string) {
      const avatar = await dependencies.avatarsRepository.findByIdForOwner(ownerId, avatarId);

      if (!avatar) {
        throw new NotFoundError("Avatar not found");
      }

      const conversations = await dependencies.conversationsRepository.listPrivateForAvatar(ownerId, avatar.id);

      return conversations.map(toConversationSummaryDto);
    },

    async getConversation(ownerId: string, conversationId: string) {
      const conversation = await dependencies.conversationsRepository.findPrivateById(ownerId, conversationId);

      if (!conversation) {
        throw new NotFoundError("Conversation not found");
      }

      return toConversationDetailDto(conversation);
    },
  };
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
