import { Hono, type Context } from "hono";
import {
  CreateAvatarAgentInputSchema,
  NotFoundError,
  UpdateAvatarAgentInputSchema,
} from "@yuni/domain";
import { notFoundError, unauthorizedError, validationError } from "../../utils/errors";
import { getSessionToken, verifySessionToken } from "../auth/session";
import { createAvatarsService, type AvatarsServiceDependencies } from "./service";

export type AvatarsControllerDependencies = AvatarsServiceDependencies;

function isEmptyObject(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
}

async function getCurrentSession(context: Context) {
  const token = getSessionToken(context);

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function createAvatarsController(dependencies: AvatarsControllerDependencies) {
  const avatars = new Hono();
  const service = createAvatarsService(dependencies);

  avatars.get("/avatars", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    return context.json({ avatars: await service.listAvatars(session.userId) });
  });

  avatars.post("/avatars", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    const body: unknown = await context.req.json().catch(() => null);
    const parsed = CreateAvatarAgentInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    return context.json({ avatar: await service.createAvatar(session.userId, parsed.data) }, 201);
  });

  avatars.get("/avatars/:avatarId", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    try {
      const avatar = await service.getAvatar(session.userId, context.req.param("avatarId"));

      return context.json({ avatar });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return context.json(notFoundError("Avatar not found"), 404);
      }

      throw error;
    }
  });

  avatars.patch("/avatars/:avatarId", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    const body: unknown = await context.req.json().catch(() => null);

    if (isEmptyObject(body)) {
      return context.json(validationError([{ message: "At least one avatar field must be provided" }]), 400);
    }

    const parsed = UpdateAvatarAgentInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      const avatar = await service.updateAvatar(session.userId, context.req.param("avatarId"), parsed.data);

      return context.json({ avatar });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return context.json(notFoundError("Avatar not found"), 404);
      }

      throw error;
    }
  });

  avatars.delete("/avatars/:avatarId", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    try {
      await service.deleteAvatar(session.userId, context.req.param("avatarId"));

      return context.json({ ok: true });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return context.json(notFoundError("Avatar not found"), 404);
      }

      throw error;
    }
  });

  return avatars;
}
