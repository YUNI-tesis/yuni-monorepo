import { Hono, type Context } from "hono";
import { badGatewayError, serviceUnavailableError, unauthorizedError } from "../../utils/errors";
import { getSessionToken, verifySessionToken } from "../auth/session";
import {
  createLiveAvatarService,
  LiveAvatarProviderServiceError,
  LiveAvatarProviderTimeoutServiceError,
  LiveAvatarUnavailableServiceError,
  type LiveAvatarServiceDependencies,
} from "./service";

export type LiveAvatarControllerDependencies = LiveAvatarServiceDependencies;

async function getCurrentSession(context: Context) {
  const token = getSessionToken(context);

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function createLiveAvatarController(dependencies: LiveAvatarControllerDependencies) {
  const liveAvatar = new Hono();
  const service = createLiveAvatarService(dependencies);

  liveAvatar.get("/live-avatar/avatars", async (context) => {
    const session = await getCurrentSession(context);

    if (!session) {
      return context.json(unauthorizedError(), 401);
    }

    try {
      return context.json({ avatars: await service.listAvatars() });
    } catch (error) {
      if (error instanceof LiveAvatarUnavailableServiceError) {
        return context.json(serviceUnavailableError("Live Avatar is not configured"), 503);
      }

      if (error instanceof LiveAvatarProviderServiceError) {
        return context.json(badGatewayError("Live Avatar provider failed"), 502);
      }

      if (error instanceof LiveAvatarProviderTimeoutServiceError) {
        return context.json(badGatewayError("Live Avatar provider timed out"), 502);
      }

      throw error;
    }
  });

  return liveAvatar;
}
