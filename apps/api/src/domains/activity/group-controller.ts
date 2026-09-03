import { Hono, type Context } from "hono";
import { NotFoundError } from "@yuni/domain";
import { notFoundError, validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import { InvalidActivityCursorError } from "./service";
import {
  createAvatarGroupActivityService,
  type AvatarGroupActivityServiceDependencies,
} from "./group-service";

export type AvatarGroupActivityControllerDependencies = AvatarGroupActivityServiceDependencies;

export function createAvatarGroupActivityController(dependencies: AvatarGroupActivityControllerDependencies) {
  const activity = new Hono<CreatorSessionEnv>();
  const service = createAvatarGroupActivityService(dependencies);

  activity.get("/avatar-groups/:groupId/activity/participants", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json(await service.listParticipants(currentUser.id, context.req.param("groupId")));
    } catch (error) {
      return handleActivityError(context, error);
    }
  });

  activity.get(
    "/avatar-groups/:groupId/activity/participants/:participantKey/conversations",
    async (context) => {
      const currentUser = context.get("currentUser");
      const parsedQuery = parseConversationsQuery(context.req.query("limit"), context.req.query("cursor"));
      if (!parsedQuery.ok) {
        return context.json(validationError([{ message: parsedQuery.message }]), 400);
      }
      try {
        return context.json(
          await service.listConversations(
            currentUser.id,
            context.req.param("groupId"),
            context.req.param("participantKey"),
            parsedQuery.value
          )
        );
      } catch (error) {
        return handleActivityError(context, error);
      }
    }
  );

  activity.get("/avatar-groups/:groupId/activity/conversations/:conversationId", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        conversation: await service.getConversation(
          currentUser.id,
          context.req.param("groupId"),
          context.req.param("conversationId")
        ),
      });
    } catch (error) {
      return handleActivityError(context, error);
    }
  });

  return activity;
}

function parseConversationsQuery(limitValue?: string, cursor?: string) {
  const limit = limitValue === undefined ? 20 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { ok: false as const, message: "Limit must be an integer between 1 and 50" };
  }
  if (cursor !== undefined && cursor.trim().length === 0) {
    return { ok: false as const, message: "Cursor must not be empty" };
  }
  return { ok: true as const, value: { limit, ...(cursor ? { cursor } : {}) } };
}

function handleActivityError(context: Context, error: unknown) {
  if (error instanceof InvalidActivityCursorError) {
    return context.json(validationError([{ message: error.message }]), 400);
  }
  if (error instanceof NotFoundError) {
    return context.json(notFoundError(error.message), 404);
  }
  throw error;
}
