import { Hono, type Context } from "hono";
import { CreateConversationInputSchema, NotFoundError } from "@yuni/domain";
import { notFoundError, validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import { createConversationsService, type ConversationsServiceDependencies } from "./service";

export type ConversationsControllerDependencies = ConversationsServiceDependencies;

export function createConversationsController(dependencies: ConversationsControllerDependencies) {
  const conversations = new Hono<CreatorSessionEnv>();
  const service = createConversationsService(dependencies);

  conversations.get("/avatars/:avatarId/conversations", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      return context.json({
        conversations: await service.listAvatarConversations(currentUser.id, context.req.param("avatarId")),
      });
    } catch (error) {
      return toConversationsError(context, error);
    }
  });

  conversations.post("/avatars/:avatarId/conversations", async (context) => {
    const currentUser = context.get("currentUser");

    const body: unknown = await context.req.json().catch(() => ({}));
    const parsed = CreateConversationInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      return context.json(
        {
          conversation: await service.createAvatarConversation(
            currentUser.id,
            context.req.param("avatarId"),
            parsed.data
          ),
        },
        201
      );
    } catch (error) {
      return toConversationsError(context, error);
    }
  });

  conversations.get("/avatars/:avatarId/conversations/latest", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      return context.json({
        conversation: await service.getLatestAvatarConversation(
          currentUser.id,
          context.req.param("avatarId")
        ),
      });
    } catch (error) {
      return toConversationsError(context, error);
    }
  });

  conversations.get("/conversations/:conversationId", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      return context.json({
        conversation: await service.getConversation(currentUser.id, context.req.param("conversationId")),
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
