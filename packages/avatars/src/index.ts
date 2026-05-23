import { type LiveAvatarConfig, liveAvatarConfig, requireLiveAvatarConfig } from "@yuni/config";

export type AvatarProviderName = "liveavatar";
export type LiveAvatarMode = LiveAvatarConfig["mode"];

export type AvatarOption = {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  provider: AvatarProviderName;
  mode: LiveAvatarMode;
  sandbox: boolean;
};

export interface AvatarProvider {
  readonly name: AvatarProviderName;
  listAvatars(): Promise<AvatarOption[]>;
}

export class AvatarProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "AvatarProviderError";
  }
}

export class AvatarProviderUnavailableError extends AvatarProviderError {
  constructor(message = "Live Avatar is not configured", cause?: unknown) {
    super(message, cause);
    this.name = "AvatarProviderUnavailableError";
  }
}

export class AvatarProviderTimeoutError extends AvatarProviderError {
  constructor(message = "Live Avatar request timed out", cause?: unknown) {
    super(message, cause);
    this.name = "AvatarProviderTimeoutError";
  }
}

export type LiveAvatarProviderOptions = {
  config?: LiveAvatarConfig;
  fetch?: typeof fetch;
};

export class LiveAvatarProvider implements AvatarProvider {
  readonly name = "liveavatar";
  private readonly config: LiveAvatarConfig;
  private readonly fetcher: typeof fetch;

  constructor(options: LiveAvatarProviderOptions = {}) {
    this.config = options.config ?? liveAvatarConfig;
    this.fetcher = options.fetch ?? fetch;
  }

  async listAvatars(): Promise<AvatarOption[]> {
    const config = this.requireConfig();

    return this.fetchAvatarList(config, "/v1/avatars/public");
  }

  private requireConfig(): LiveAvatarConfig {
    try {
      return requireLiveAvatarConfig(this.config);
    } catch (error) {
      throw new AvatarProviderUnavailableError("Live Avatar is not configured", error);
    }
  }

  private async fetchAvatarList(config: LiveAvatarConfig, path: string): Promise<AvatarOption[]> {
    const url = new URL(path, withTrailingSlash(config.baseUrl));
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.requestTimeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: "GET",
          headers: {
            "X-API-KEY": config.apiKey,
            Accept: "application/json",
          },
          signal: abortController.signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new AvatarProviderTimeoutError("Live Avatar request timed out", error);
        }

        throw new AvatarProviderError("Live Avatar request failed", error);
      }

      if (!response.ok) {
        throw new AvatarProviderError(`Live Avatar returned ${response.status}`);
      }

      const body: unknown = await response.json().catch((error: unknown) => {
        if (isAbortError(error)) {
          throw new AvatarProviderTimeoutError("Live Avatar request timed out", error);
        }

        throw new AvatarProviderError("Live Avatar returned invalid JSON", error);
      });

      return extractAvatarItems(body)
        .map((item) => normalizeAvatarOption(item, config))
        .filter((option): option is AvatarOption => option !== null);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type MockAvatarProviderOptions = {
  avatars?: AvatarOption[];
  error?: Error;
};

export class MockAvatarProvider implements AvatarProvider {
  readonly name = "liveavatar";
  private readonly avatars: AvatarOption[];
  private readonly error: Error | undefined;

  constructor(options: MockAvatarProviderOptions = {}) {
    this.avatars = options.avatars ?? [];
    this.error = options.error;
  }

  async listAvatars(): Promise<AvatarOption[]> {
    if (this.error) {
      throw this.error;
    }

    return this.avatars;
  }
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function extractAvatarItems(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }

  if (isRecord(body)) {
    const data =
      body.data ??
      body.avatars ??
      body.public_avatars ??
      body.publicAvatars ??
      body.public_avatar_list ??
      body.publicAvatarList ??
      body.avatar_list ??
      body.avatarList ??
      body.items ??
      body.results;

    if (Array.isArray(data)) {
      return data;
    }

    if (isRecord(data)) {
      return extractAvatarItems(data);
    }
  }

  return [];
}

function normalizeAvatarOption(item: unknown, config: LiveAvatarConfig): AvatarOption | null {
  if (!isRecord(item)) {
    return null;
  }

  const id = readString(item.id) ?? readString(item.avatar_id) ?? readString(item.avatarId);

  if (!id) {
    return null;
  }

  return {
    id,
    displayName:
      readString(item.display_name) ??
      readString(item.displayName) ??
      readString(item.name) ??
      "Avatar sin nombre",
    thumbnailUrl:
      readString(item.thumbnail_url) ??
      readString(item.thumbnailUrl) ??
      readString(item.preview_image_url) ??
      readString(item.previewImageUrl) ??
      readString(item.preview_url) ??
      readString(item.previewUrl) ??
      readString(item.image_url) ??
      readString(item.imageUrl) ??
      readString(item.cover_img_url) ??
      readString(item.coverImgUrl) ??
      null,
    provider: "liveavatar",
    mode: config.mode,
    sandbox: config.sandbox,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}
