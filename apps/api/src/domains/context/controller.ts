import { Hono, type Context } from "hono";
import { PresignDocumentUploadInputSchema } from "@yuni/domain";
import { conflictError, notFoundError, serviceUnavailableError, validationError } from "../../utils/errors";
import type { CreatorSessionEnv } from "../auth/middleware";
import { DocumentStateConflictError } from "./repository";
import {
  ContextNotFoundError,
  ContextStorageUnavailableError,
  InvalidStoredUploadError,
  createAvatarContextService,
  type AvatarContextServiceDependencies,
} from "./service";

export type AvatarContextControllerDependencies = AvatarContextServiceDependencies;

export function createAvatarContextController(dependencies: AvatarContextControllerDependencies) {
  const controller = new Hono<CreatorSessionEnv>();
  const service = createAvatarContextService(dependencies);

  controller.get("/avatars/:avatarId/context", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        context: await service.get(currentUser.id, context.req.param("avatarId")),
      });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.patch("/avatars/:avatarId/context", async (context) => {
    const currentUser = context.get("currentUser");
    const body = (await context.req.json().catch(() => null)) as { text?: unknown } | null;
    if (!body || typeof body.text !== "string" || body.text.length > 20_000) {
      return context.json(
        validationError([{ path: ["text"], message: "Text must contain at most 20,000 characters" }]),
        400
      );
    }
    try {
      return context.json({
        context: await service.updateText(currentUser.id, context.req.param("avatarId"), body.text.trim()),
      });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.post("/avatars/:avatarId/documents/presign-upload", async (context) => {
    const currentUser = context.get("currentUser");
    const parsed = PresignDocumentUploadInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.presign(currentUser.id, context.req.param("avatarId"), parsed.data),
        201
      );
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.post("/documents/:documentId/confirm-upload", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        document: await service.confirm(currentUser.id, context.req.param("documentId")),
      });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.post("/documents/:documentId/retry", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json({
        document: await service.retry(currentUser.id, context.req.param("documentId")),
      });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.delete("/documents/:documentId", async (context) => {
    const currentUser = context.get("currentUser");
    try {
      return context.json(await service.remove(currentUser.id, context.req.param("documentId")));
    } catch (error) {
      return contextError(context, error);
    }
  });

  return controller;
}

function contextError(context: Context, error: unknown) {
  if (error instanceof ContextNotFoundError) return context.json(notFoundError(), 404);
  if (error instanceof ContextStorageUnavailableError) {
    return context.json(serviceUnavailableError("Document storage is not configured"), 503);
  }
  if (error instanceof InvalidStoredUploadError) {
    return context.json(validationError([{ message: error.message }], error.message), 400);
  }
  if (error instanceof DocumentStateConflictError) return context.json(conflictError(error.message), 409);
  throw error;
}
