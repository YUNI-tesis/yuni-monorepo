import {
  AvatarProviderError,
  AvatarProviderTimeoutError,
  AvatarProviderUnavailableError,
  type AvatarOption,
  type AvatarProvider,
} from "@yuni/avatars";

export class LiveAvatarUnavailableServiceError extends Error {
  constructor(message = "Live Avatar is not configured") {
    super(message);
    this.name = "LiveAvatarUnavailableServiceError";
  }
}

export class LiveAvatarProviderServiceError extends Error {
  constructor(message = "Live Avatar provider failed") {
    super(message);
    this.name = "LiveAvatarProviderServiceError";
  }
}

export class LiveAvatarProviderTimeoutServiceError extends Error {
  constructor(message = "Live Avatar provider timed out") {
    super(message);
    this.name = "LiveAvatarProviderTimeoutServiceError";
  }
}

export type LiveAvatarServiceDependencies = {
  provider: AvatarProvider;
};

export function createLiveAvatarService({ provider }: LiveAvatarServiceDependencies) {
  return {
    async listAvatars(): Promise<AvatarOption[]> {
      try {
        return await provider.listAvatars();
      } catch (error) {
        if (error instanceof AvatarProviderUnavailableError) {
          throw new LiveAvatarUnavailableServiceError();
        }

        if (error instanceof AvatarProviderTimeoutError) {
          throw new LiveAvatarProviderTimeoutServiceError();
        }

        if (error instanceof AvatarProviderError) {
          throw new LiveAvatarProviderServiceError();
        }

        throw error;
      }
    },
  };
}

export type LiveAvatarService = ReturnType<typeof createLiveAvatarService>;
