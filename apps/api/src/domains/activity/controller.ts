import { Hono, type Context } from "hono";
import { NotFoundError } from "@yuni/domain";
import { notFoundError, unauthorizedError, validationError } from "../../utils/errors";
import { getSessionToken, verifySessionToken } from "../auth/session";
import {
  createAvatarActivityService,
  InvalidActivityCursorError,
  type AvatarActivityServiceDependencies,
} from "./service";

export type AvatarActivityControllerDependencies = AvatarActivityServiceDependencies;

async function getCurrentSession(context: Context) {
  const token = getSessionToken(context);
  return token ? verifySessionToken(token) : null;
}

export function createAvatarActivityController(dependencies: AvatarActivityControllerDependencies) {
  const activity = new Hono();
  const service = createAvatarActivityService(dependencies);

  activity.get("/avatars/:avatarId/activity/participants", async (context) => {
    const session = await getCurrentSession(context);
    if (!session) return context.json(unauthorizedError(), 401);

    try {
      return context.json({
        participants: await service.listParticipants(session.userId, context.req.param("avatarId")),
      });
    } catch (error) {
      return handleActivityError(context, error);
    }
  });

  activity.get("/avatars/:avatarId/activity/participants/:accessGrantId/conversations", async (context) => {
    const session = await getCurrentSession(context);
    if (!session) return context.json(unauthorizedError(), 401);

    const parsedQuery = parseConversationsQuery(context.req.query("limit"), context.req.query("cursor"));
    if (!parsedQuery.ok) {
      return context.json(validationError([{ message: parsedQuery.message }]), 400);
    }

    try {
      return context.json(
        await service.listConversations(
          session.userId,
          context.req.param("avatarId"),
          context.req.param("accessGrantId"),
          parsedQuery.value
        )
      );
    } catch (error) {
      return handleActivityError(context, error);
    }
  });

  activity.get("/avatars/:avatarId/activity/conversations/:conversationId", async (context) => {
    const session = await getCurrentSession(context);
    if (!session) return context.json(unauthorizedError(), 401);

    try {
      return context.json({
        conversation: await service.getConversation(
          session.userId,
          context.req.param("avatarId"),
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
