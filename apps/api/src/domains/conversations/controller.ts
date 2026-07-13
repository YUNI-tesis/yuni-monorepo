import { Hono, type Context } from "hono";
import { NotFoundError } from "@yuni/domain";
import { notFoundError, unauthorizedError } from "../../utils/errors";
import { getSessionToken, verifySessionToken } from "../auth/session";
import {
  createConversationsService,
  type ConversationsServiceDependencies,
} from "./service";

export type ConversationsControllerDependencies = ConversationsServiceDependencies;

async function getCurrentSession(context: Context) {
  const token = getSessionToken(context);

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function createConversationsController(dependencies: ConversationsControllerDependencies) {
  const conversations = new Hono();
  const service = createConversationsService(dependencies);

  conversations.get("/avatars/:avatarId/conversations", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    try {
      return context.json({
        conversations: await service.listAvatarConversations(session.userId, context.req.param("avatarId")),
      });
    } catch (error) {
      return toConversationsError(context, error);
    }
  });

  conversations.get("/conversations/:conversationId", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    try {
      return context.json({
        conversation: await service.getConversation(session.userId, context.req.param("conversationId")),
      });
    } catch (error) {
      return toConversationsError(context, error);
    }
  });

  return conversations;
}

function toConversationsError(context: Context, error: unknown) {
  if (error instanceof NotFoundError) {
    return context.json(notFoundError(error.message), 404);
  }

  throw error;
}
