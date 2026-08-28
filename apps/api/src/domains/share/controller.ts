import { Hono, type Context } from "hono";
import { CreateShareLinkInputSchema, NotFoundError, UpdateShareLinkInputSchema } from "@yuni/domain";
import { conflictError, notFoundError, validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import {
  createShareLinksService,
  DuplicateShareSlugError,
  type ShareLinksServiceDependencies,
} from "./service";

export type ShareLinksControllerDependencies = ShareLinksServiceDependencies;

function isEmptyObject(value: unknown) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0
  );
}

export function createPublicShareLinksController(dependencies: ShareLinksControllerDependencies) {
  const share = new Hono();
  const service = createShareLinksService(dependencies);

  share.get("/public/links/:slug/avatar", async (context) => {
    try {
      return context.json(await service.resolvePublicAvatar(context.req.param("slug")));
    } catch (error) {
      if (error instanceof NotFoundError) {
        return context.json(notFoundError("Public avatar not found"), 404);
      }

      throw error;
    }
  });

  return share;
}

export function createShareLinksController(dependencies: ShareLinksControllerDependencies) {
  const share = new Hono<CreatorSessionEnv>();
  const service = createShareLinksService(dependencies);

  share.get("/avatars/:avatarId/share-links", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      return context.json({
        shareLinks: await service.listShareLinks(currentUser.id, context.req.param("avatarId")),
      });
    } catch (error) {
      return handleShareError(error, context);
    }
  });

  share.post("/avatars/:avatarId/share-links", async (context) => {
    const currentUser = context.get("currentUser");

    const body: unknown = await context.req.json().catch(() => null);
    const parsed = CreateShareLinkInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      return context.json(
        {
          shareLink: await service.createShareLink(
            currentUser.id,
            context.req.param("avatarId"),
            parsed.data
          ),
        },
        201
      );
    } catch (error) {
      return handleShareError(error, context);
    }
  });

  share.patch("/avatars/:avatarId/share-links/:shareLinkId", async (context) => {
    const currentUser = context.get("currentUser");

    const body: unknown = await context.req.json().catch(() => null);

    if (isEmptyObject(body)) {
      return context.json(
        validationError([{ message: "At least one share link field must be provided" }]),
        400
      );
    }

    const parsed = UpdateShareLinkInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      return context.json({
        shareLink: await service.updateShareLink(
          currentUser.id,
          context.req.param("avatarId"),
          context.req.param("shareLinkId"),
          parsed.data
        ),
      });
    } catch (error) {
      return handleShareError(error, context);
    }
  });

  share.delete("/avatars/:avatarId/share-links/:shareLinkId", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      await service.deleteShareLink(
        currentUser.id,
        context.req.param("avatarId"),
        context.req.param("shareLinkId")
      );

      return context.json({ ok: true });
    } catch (error) {
      return handleShareError(error, context);
    }
  });

  return share;
}

function handleShareError(error: unknown, context: Context) {
  if (error instanceof NotFoundError) {
    return context.json(notFoundError("Share link not found"), 404);
  }

  if (error instanceof DuplicateShareSlugError) {
    return context.json(conflictError("Share link slug already exists"), 409);
  }

  throw error;
}
