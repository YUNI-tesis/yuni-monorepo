import type { ConversationMode, Prisma, PrismaClient } from "@prisma/client";
import { OwnershipError } from "@yuni/domain";

type Db = PrismaClient | Prisma.TransactionClient;

export function createConversationRepository(db: Db) {
  return {
    async createPrivate(ownerId: string, avatarAgentId: string, mode: ConversationMode = "text") {
      const avatar = await db.avatarAgent.findFirst({ where: { id: avatarAgentId, ownerId } });
      if (!avatar) throw new OwnershipError();

      return db.conversation.create({
        data: {
          ownerId,
          avatarAgentId,
          visibility: "private",
          mode,
        },
      });
    },

    createPrivateForParticipant(input: {
      ownerId: string;
      avatarAgentId: string;
      mode: ConversationMode;
      accessGrantId?: string;
      participantEmail?: string;
    }) {
      return db.conversation.create({
        data: {
          ownerId: input.ownerId,
          avatarAgentId: input.avatarAgentId,
          visibility: "private",
          mode: input.mode,
          ...(input.accessGrantId ? { accessGrantId: input.accessGrantId } : {}),
          ...(input.participantEmail ? { participantEmail: input.participantEmail } : {}),
        },
      });
    },

    createPublic(
      shareLinkId: string,
      avatarAgentId: string,
      publicSessionId: string,
      mode: ConversationMode = "text"
    ) {
      return db.conversation.create({
        data: {
          avatarAgentId,
          shareLinkId,
          publicSessionId,
          visibility: "public",
          mode,
        },
      });
    },

    findLatestPrivate(ownerId: string, avatarAgentId: string) {
      return db.conversation.findFirst({
        where: { ownerId, avatarAgentId, visibility: "private" },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      });
    },

    findLatestPrivateForAccess(ownerId: string, avatarAgentId: string, accessGrantId: string | null) {
      return db.conversation.findFirst({
        where: {
          ownerId,
          avatarAgentId,
          visibility: "private",
          accessGrantId,
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      });
    },

    listPrivateForAvatar(ownerId: string, avatarAgentId: string) {
      return db.conversation.findMany({
        where: { ownerId, avatarAgentId, visibility: "private" },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      });
    },

    listPrivateForAccess(ownerId: string, avatarAgentId: string, accessGrantId: string | null) {
      return db.conversation.findMany({
        where: {
          ownerId,
          avatarAgentId,
          visibility: "private",
          accessGrantId,
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      });
    },

    findPrivateIdentityById(conversationId: string) {
      return db.conversation.findFirst({
        where: { id: conversationId, visibility: "private" },
        select: {
          id: true,
          ownerId: true,
          avatarAgentId: true,
          accessGrantId: true,
        },
      });
    },

    findPrivateById(ownerId: string, conversationId: string) {
      return db.conversation.findFirst({
        where: { id: conversationId, ownerId, visibility: "private" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    },

    findPrivateByIdForAccess(ownerId: string, conversationId: string, accessGrantId: string | null) {
      return db.conversation.findFirst({
        where: {
          id: conversationId,
          ownerId,
          visibility: "private",
          accessGrantId,
        },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    },

    markEnded(id: string) {
      return db.conversation.update({
        where: { id },
        data: { status: "ended" },
      });
    },

    updateTitle(id: string, title: string) {
      return db.conversation.update({
        where: { id },
        data: { title },
      });
    },

    findPublicBySession(publicSessionId: string) {
      return db.conversation.findFirst({
        where: { publicSessionId, visibility: "public" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    },
  };
}
