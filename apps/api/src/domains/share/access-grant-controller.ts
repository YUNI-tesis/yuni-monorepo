import { Hono, type Context } from "hono";
import {
  CreateAccessGrantInputSchema,
  NotFoundError,
  SelfAccessGrantError,
  UpdateAccessGrantInputSchema,
} from "@yuni/domain";
import { conflictError, notFoundError, validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import {
  createAccessGrantsService,
  DuplicateAccessGrantError,
  type AccessGrantsServiceDependencies,
} from "./access-grant-service";

export type AccessGrantsControllerDependencies = AccessGrantsServiceDependencies;

export function createAccessGrantsController(dependencies: AccessGrantsControllerDependencies) {
  const accessGrants = new Hono<CreatorSessionEnv>();
  const service = createAccessGrantsService(dependencies);

  accessGrants.get("/avatars/:avatarId/access-grants", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      return context.json({
        accessGrants: await service.listAccessGrants(currentUser.id, context.req.param("avatarId")),
      });
    } catch (error) {
      return handleAccessGrantError(error, context);
    }
  });

  accessGrants.post("/avatars/:avatarId/access-grants", async (context) => {
    const currentUser = context.get("currentUser");

    const body: unknown = await context.req.json().catch(() => null);
    const parsed = CreateAccessGrantInputSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      return context.json(
        {
          accessGrant: await service.createAccessGrant(
            currentUser.id,
            context.req.param("avatarId"),
            parsed.data
          ),
        },
        201
      );
    } catch (error) {
      return handleAccessGrantError(error, context);
    }
  });

  accessGrants.patch("/avatars/:avatarId/access-grants/:accessGrantId", async (context) => {
    const currentUser = context.get("currentUser");

    const body: unknown = await context.req.json().catch(() => null);
    const parsed = UpdateAccessGrantInputSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      return context.json({
        accessGrant: await service.updateAccessGrant(
          currentUser.id,
          context.req.param("avatarId"),
          context.req.param("accessGrantId"),
          parsed.data
        ),
      });
    } catch (error) {
      return handleAccessGrantError(error, context);
    }
  });

  accessGrants.delete("/avatars/:avatarId/access-grants/:accessGrantId", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      const result = await service.deleteAccessGrant(
        currentUser.id,
        context.req.param("avatarId"),
        context.req.param("accessGrantId")
      );
      return context.json({ ok: true, outcome: result.outcome });
    } catch (error) {
      return handleAccessGrantError(error, context);
    }
  });

  return accessGrants;
}

function handleAccessGrantError(error: unknown, context: Context) {
  if (error instanceof NotFoundError) {
    return context.json(notFoundError("Access grant not found"), 404);
  }
  if (error instanceof DuplicateAccessGrantError) {
    return context.json(conflictError(error.message), 409);
  }
  if (error instanceof SelfAccessGrantError) {
    return context.json(
      validationError([{ message: error.message }], error.message, "SELF_ACCESS_GRANT"),
      400
    );
  }
  throw error;
}
