import { Hono } from "hono";
import type { CreatorSessionEnv } from "../auth/middleware";
import { badGatewayError, serviceUnavailableError } from "../../utils/errors";
import {
  createLiveAvatarService,
  LiveAvatarProviderServiceError,
  LiveAvatarProviderTimeoutServiceError,
  LiveAvatarUnavailableServiceError,
  type LiveAvatarServiceDependencies,
} from "./service";

export type LiveAvatarControllerDependencies = LiveAvatarServiceDependencies;

export function createLiveAvatarController(dependencies: LiveAvatarControllerDependencies) {
  const liveAvatar = new Hono<CreatorSessionEnv>();
  const service = createLiveAvatarService(dependencies);

  liveAvatar.get("/live-avatar/avatars", async (context) => {
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
