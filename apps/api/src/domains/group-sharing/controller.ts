import { Hono, type Context } from "hono";
import {
  CreateAccessGrantInputSchema,
  CreateShareLinkInputSchema,
  GroupSharingIneligibleError,
  GroupSharingPreparationBusyError,
  NotFoundError,
  SelfAccessGrantError,
  UpdateAccessGrantInputSchema,
  UpdateShareLinkInputSchema,
} from "@yuni/domain";
import type { CreatorSessionEnv } from "../auth/middleware";
import { conflictError, notFoundError, serviceUnavailableError, validationError } from "../../utils/errors";
import {
  createGroupSharingService,
  DuplicateGroupAccessGrantError,
  DuplicateGroupShareSlugError,
  type GroupSharingServiceDependencies,
} from "./service";

export type GroupSharingControllerDependencies = GroupSharingServiceDependencies & {
  accountSharingEnabled?: () => boolean;
  publicSharingEnabled?: () => boolean;
};

export function createPublicGroupSharingController(dependencies: GroupSharingControllerDependencies) {
  const controller = new Hono();
  const service = createGroupSharingService(dependencies);
  controller.get("/public/group-links/:slug", async (context) => {
    if (dependencies.publicSharingEnabled && !dependencies.publicSharingEnabled()) {
      return context.json(notFoundError("Public group not found"), 404);
    }
    try {
      return context.json(await service.resolvePublicGroup(context.req.param("slug")));
    } catch (error) {
      return handleError(context, error);
    }
  });
  return controller;
}

export function createGroupSharingController(dependencies: GroupSharingControllerDependencies) {
  const controller = new Hono<CreatorSessionEnv>();
  const service = createGroupSharingService(dependencies);

  controller.use("/avatar-groups/:id/share-links", async (context, next) => {
    if (dependencies.publicSharingEnabled && !dependencies.publicSharingEnabled()) {
      return context.json(notFoundError("Group share links are disabled"), 404);
    }
    await next();
  });
  controller.use("/avatar-groups/:id/share-links/*", async (context, next) => {
    if (dependencies.publicSharingEnabled && !dependencies.publicSharingEnabled()) {
      return context.json(notFoundError("Group share links are disabled"), 404);
    }
    await next();
  });
  controller.use("/avatar-groups/:id/access-grants", async (context, next) => {
    if (dependencies.accountSharingEnabled && !dependencies.accountSharingEnabled()) {
      return context.json(notFoundError("Group access grants are disabled"), 404);
    }
    await next();
  });
  controller.use("/avatar-groups/:id/access-grants/*", async (context, next) => {
    if (dependencies.accountSharingEnabled && !dependencies.accountSharingEnabled()) {
      return context.json(notFoundError("Group access grants are disabled"), 404);
    }
    await next();
  });

  controller.get("/avatar-groups/:id/share-links", async (context) => {
    const user = context.get("currentUser");
    try {
      return context.json({ shareLinks: await service.listShareLinks(user.id, context.req.param("id")) });
    } catch (error) {
      return handleError(context, error);
    }
  });
  controller.post("/avatar-groups/:id/share-links", async (context) => {
    const parsed = CreateShareLinkInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    const user = context.get("currentUser");
    try {
      return context.json(
        { shareLink: await service.createShareLink(user.id, context.req.param("id"), parsed.data) },
        201
      );
    } catch (error) {
      return handleError(context, error);
    }
  });
  controller.patch("/avatar-groups/:id/share-links/:linkId", async (context) => {
    const parsed = UpdateShareLinkInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    const user = context.get("currentUser");
    try {
      return context.json({
        shareLink: await service.updateShareLink(
          user.id,
          context.req.param("id"),
          context.req.param("linkId"),
          parsed.data
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  controller.delete("/avatar-groups/:id/share-links/:linkId", async (context) => {
    const user = context.get("currentUser");
    try {
      return context.json(
        await service.deleteShareLink(user.id, context.req.param("id"), context.req.param("linkId"))
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  controller.get("/avatar-groups/:id/access-grants", async (context) => {
    const user = context.get("currentUser");
    try {
      return context.json({
        accessGrants: await service.listAccessGrants(user.id, context.req.param("id")),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  controller.post("/avatar-groups/:id/access-grants", async (context) => {
    const parsed = CreateAccessGrantInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    const user = context.get("currentUser");
    try {
      return context.json(
        { accessGrant: await service.createAccessGrant(user.id, context.req.param("id"), parsed.data) },
        201
      );
    } catch (error) {
      return handleError(context, error);
    }
  });
  controller.patch("/avatar-groups/:id/access-grants/:grantId", async (context) => {
    const parsed = UpdateAccessGrantInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    const user = context.get("currentUser");
    try {
      return context.json({
        accessGrant: await service.updateAccessGrant(
          user.id,
          context.req.param("id"),
          context.req.param("grantId"),
          parsed.data
        ),
      });
    } catch (error) {
      return handleError(context, error);
    }
  });
  controller.delete("/avatar-groups/:id/access-grants/:grantId", async (context) => {
    const user = context.get("currentUser");
    try {
      return context.json(
        await service.revokeAccessGrant(user.id, context.req.param("id"), context.req.param("grantId"))
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  return controller;
}

function handleError(context: Context, error: unknown) {
  if (error instanceof NotFoundError) return context.json(notFoundError(error.message), 404);
  if (error instanceof DuplicateGroupShareSlugError) {
    return context.json(conflictError("Share link slug already exists"), 409);
  }
  if (error instanceof DuplicateGroupAccessGrantError) {
    return context.json(conflictError("Access grant already exists"), 409);
  }
  if (error instanceof GroupSharingPreparationBusyError) {
    return context.json(serviceUnavailableError(error.message, "GROUP_PREPARING"), 503);
  }
  if (error instanceof SelfAccessGrantError || error instanceof GroupSharingIneligibleError) {
    return context.json(validationError([{ message: error.message }], error.message), 400);
  }
  throw error;
}
