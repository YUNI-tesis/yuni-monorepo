import type { MiddlewareHandler } from "hono";
import { unauthorizedError } from "../../utils/errors";
import type { AuthRepository, PublicUser } from "./repository";
import { clearSessionCookie, getSessionToken, verifySessionToken } from "./session";

export type CreatorSessionEnv = {
  Variables: {
    currentUser: PublicUser;
  };
};

export type CreatorSessionRepository = Pick<AuthRepository, "findPublicById">;

export function createCreatorSessionMiddleware(
  repository: CreatorSessionRepository
): MiddlewareHandler<CreatorSessionEnv> {
  return async (context, next) => {
    const token = getSessionToken(context);

    if (token === undefined) {
      return context.json(unauthorizedError("Unauthorized", "SESSION_REQUIRED"), 401);
    }

    const session = token ? await verifySessionToken(token) : null;

    if (!session) {
      clearSessionCookie(context);
      return context.json(unauthorizedError("Unauthorized", "SESSION_INVALID"), 401);
    }

    const currentUser = await repository.findPublicById(session.userId);

    if (!currentUser) {
      clearSessionCookie(context);
      return context.json(unauthorizedError("Unauthorized", "SESSION_INVALID"), 401);
    }

    context.set("currentUser", currentUser);
    await next();
  };
}
