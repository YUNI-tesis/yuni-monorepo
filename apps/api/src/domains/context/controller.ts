import { Hono, type Context } from "hono";
import { PresignDocumentUploadInputSchema } from "@yuni/domain";
import {
  conflictError,
  notFoundError,
  serviceUnavailableError,
  unauthorizedError,
  validationError,
} from "../../utils/errors";
import { getSessionToken, verifySessionToken } from "../auth/session";
import { DocumentStateConflictError } from "./repository";
import {
  ContextNotFoundError,
  ContextStorageUnavailableError,
  InvalidStoredUploadError,
  createAvatarContextService,
  type AvatarContextServiceDependencies,
} from "./service";

export type AvatarContextControllerDependencies = AvatarContextServiceDependencies;

async function getSession(context: Context) {
  const token = getSessionToken(context);
  return token ? verifySessionToken(token) : null;
}

export function createAvatarContextController(dependencies: AvatarContextControllerDependencies) {
  const controller = new Hono();
  const service = createAvatarContextService(dependencies);

  controller.get("/avatars/:avatarId/context", async (context) => {
    const session = await getSession(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({ context: await service.get(session.userId, context.req.param("avatarId")) });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.patch("/avatars/:avatarId/context", async (context) => {
    const session = await getSession(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const body = (await context.req.json().catch(() => null)) as { text?: unknown } | null;
    if (!body || typeof body.text !== "string" || body.text.length > 20_000) {
      return context.json(
        validationError([{ path: ["text"], message: "Text must contain at most 20,000 characters" }]),
        400
      );
    }
    try {
      return context.json({
        context: await service.updateText(session.userId, context.req.param("avatarId"), body.text.trim()),
      });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.post("/avatars/:avatarId/documents/presign-upload", async (context) => {
    const session = await getSession(context);
    if (!session) return context.json(unauthorizedError(), 401);
    const parsed = PresignDocumentUploadInputSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(validationError(parsed.error.issues), 400);
    try {
      return context.json(
        await service.presign(session.userId, context.req.param("avatarId"), parsed.data),
        201
      );
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.post("/documents/:documentId/confirm-upload", async (context) => {
    const session = await getSession(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({
        document: await service.confirm(session.userId, context.req.param("documentId")),
      });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.post("/documents/:documentId/retry", async (context) => {
    const session = await getSession(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json({ document: await service.retry(session.userId, context.req.param("documentId")) });
    } catch (error) {
      return contextError(context, error);
    }
  });

  controller.delete("/documents/:documentId", async (context) => {
    const session = await getSession(context);
    if (!session) return context.json(unauthorizedError(), 401);
    try {
      return context.json(await service.remove(session.userId, context.req.param("documentId")));
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
