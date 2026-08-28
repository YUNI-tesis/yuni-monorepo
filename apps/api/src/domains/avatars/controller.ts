import { Hono } from "hono";
import {
  CreateAvatarAgentInputSchema,
  AvatarListScopeSchema,
  NotFoundError,
  UpdateAvatarAgentInputSchema,
} from "@yuni/domain";
import { badGatewayError, notFoundError, serviceUnavailableError, validationError } from "../../utils/errors";
import {
  ElevenLabsProviderError,
  ElevenLabsProviderTimeoutError,
  ElevenLabsProviderUnavailableError,
} from "@yuni/voice";
import type { CreatorSessionEnv } from "../auth/middleware";
import { AvatarVoiceNotFoundError, createAvatarsService, type AvatarsServiceDependencies } from "./service";

export type AvatarsControllerDependencies = AvatarsServiceDependencies;

function isEmptyObject(value: unknown) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0
  );
}

export function createAvatarsController(dependencies: AvatarsControllerDependencies) {
  const avatars = new Hono<CreatorSessionEnv>();
  const service = createAvatarsService(dependencies);

  avatars.get("/avatars", async (context) => {
    const currentUser = context.get("currentUser");

    const parsedScope = AvatarListScopeSchema.safeParse(context.req.query("scope") ?? "all");

    if (!parsedScope.success) {
      return context.json(validationError(parsedScope.error.issues, "Invalid avatar scope"), 400);
    }

    return context.json({
      avatars: await service.listAvatars(currentUser.id, parsedScope.data),
    });
  });

  avatars.post("/avatars", async (context) => {
    const currentUser = context.get("currentUser");

    const body: unknown = await context.req.json().catch(() => null);
    const parsed = CreateAvatarAgentInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      return context.json({ avatar: await service.createAvatar(currentUser.id, parsed.data) }, 201);
    } catch (error) {
      if (error instanceof AvatarVoiceNotFoundError) {
        return context.json(
          validationError(
            [{ path: ["voiceConfig", "voiceId"], message: error.message }],
            "Invalid voice config"
          ),
          400
        );
      }

      if (error instanceof ElevenLabsProviderUnavailableError) {
        return context.json(serviceUnavailableError("ElevenLabs is not configured"), 503);
      }

      if (error instanceof ElevenLabsProviderTimeoutError) {
        return context.json(badGatewayError("ElevenLabs provider timed out"), 502);
      }

      if (error instanceof ElevenLabsProviderError) {
        return context.json(badGatewayError("ElevenLabs provider failed"), 502);
      }

      throw error;
    }
  });

  avatars.get("/avatars/:avatarId", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      const avatar = await service.getAvatar(currentUser.id, context.req.param("avatarId"));

      return context.json({ avatar });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return context.json(notFoundError("Avatar not found"), 404);
      }

      throw error;
    }
  });

  avatars.get("/avatars/:avatarId/interaction-context", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      const interactionContext = await service.getInteractionContext(
        currentUser.id,
        context.req.param("avatarId")
      );

      return context.json({ interactionContext });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return context.json(notFoundError("Avatar not found"), 404);
      }

      throw error;
    }
  });

  avatars.patch("/avatars/:avatarId", async (context) => {
    const currentUser = context.get("currentUser");

    const body: unknown = await context.req.json().catch(() => null);

    if (isEmptyObject(body)) {
      return context.json(validationError([{ message: "At least one avatar field must be provided" }]), 400);
    }

    const parsed = UpdateAvatarAgentInputSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.issues), 400);
    }

    try {
      const avatar = await service.updateAvatar(currentUser.id, context.req.param("avatarId"), parsed.data);

      return context.json({ avatar });
    } catch (error) {
      if (error instanceof AvatarVoiceNotFoundError) {
        return context.json(
          validationError(
            [{ path: ["voiceConfig", "voiceId"], message: error.message }],
            "Invalid voice config"
          ),
          400
        );
      }

      if (error instanceof ElevenLabsProviderUnavailableError) {
        return context.json(serviceUnavailableError("ElevenLabs is not configured"), 503);
      }

      if (error instanceof ElevenLabsProviderTimeoutError) {
        return context.json(badGatewayError("ElevenLabs provider timed out"), 502);
      }

      if (error instanceof ElevenLabsProviderError) {
        return context.json(badGatewayError("ElevenLabs provider failed"), 502);
      }

      if (error instanceof NotFoundError) {
        return context.json(notFoundError("Avatar not found"), 404);
      }

      throw error;
    }
  });

  avatars.delete("/avatars/:avatarId", async (context) => {
    const currentUser = context.get("currentUser");

    try {
      await service.deleteAvatar(currentUser.id, context.req.param("avatarId"));

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
