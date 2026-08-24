import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  type LiveAvatarConfig,
  liveAvatarConfig,
  requireLiveAvatarConfig,
  requireLiveAvatarElevenLabsConnectorConfig,
} from "@yuni/config";

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

export type LiveAvatarLiteSessionTokenInput = {
  avatarId: string;
  elevenLabsAgentId: string;
};

export type LiveAvatarLiteSessionToken = {
  sessionToken: string;
  sessionId: string | null;
};

export interface AvatarProvider {
  readonly name: AvatarProviderName;
  listAvatars(): Promise<AvatarOption[]>;
  createLiteSessionToken(input: LiveAvatarLiteSessionTokenInput): Promise<LiveAvatarLiteSessionToken>;
  stopSession(sessionToken: string): Promise<void>;
}

export class AvatarProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly status?: number
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

  async createLiteSessionToken(input: LiveAvatarLiteSessionTokenInput): Promise<LiveAvatarLiteSessionToken> {
    const config = this.requireElevenLabsConnectorConfig();
    const body = await this.fetchJson(config, "/v1/sessions/token", {
      method: "POST",
      headers: {
        "X-API-KEY": config.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: input.avatarId,
        is_sandbox: config.sandbox,
        elevenlabs_agent_config: {
          secret_id: config.elevenLabsSecretId,
          agent_id: input.elevenLabsAgentId,
        },
      }),
    });
    const token = extractSessionToken(body);

    if (!token) {
      throw new AvatarProviderError("Live Avatar did not return a session token");
    }

    return token;
  }

  async stopSession(sessionToken: string): Promise<void> {
    const config = this.requireConfig();
    await this.fetchJson(
      config,
      "/v1/sessions/stop",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
      {
        acceptedStatuses: [404, 410],
        allowEmptyBody: true,
      }
    );
  }

  private requireConfig(): LiveAvatarConfig {
    try {
      return requireLiveAvatarConfig(this.config);
    } catch (error) {
      throw new AvatarProviderUnavailableError("Live Avatar is not configured", error);
    }
  }

  private requireElevenLabsConnectorConfig(): LiveAvatarConfig {
    try {
      return requireLiveAvatarElevenLabsConnectorConfig(this.config);
    } catch (error) {
      throw new AvatarProviderUnavailableError("Live Avatar ElevenLabs connector is not configured", error);
    }
  }

  private async fetchAvatarList(config: LiveAvatarConfig, path: string): Promise<AvatarOption[]> {
    const body = await this.fetchJson(config, path, {
      method: "GET",
      headers: {
        "X-API-KEY": config.apiKey,
        Accept: "application/json",
      },
    });

    return extractAvatarItems(body)
      .map((item) => normalizeAvatarOption(item, config))
      .filter((option): option is AvatarOption => option !== null);
  }

  private async fetchJson(
    config: LiveAvatarConfig,
    path: string,
    init: RequestInit,
    options: { acceptedStatuses?: readonly number[]; allowEmptyBody?: boolean } = {}
  ): Promise<unknown> {
    const url = new URL(path, withTrailingSlash(config.baseUrl));
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), config.requestTimeoutMs);

    try {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          ...init,
          signal: abortController.signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new AvatarProviderTimeoutError("Live Avatar request timed out", error);
        }

        throw new AvatarProviderError("Live Avatar request failed", error);
      }

      const acceptedStatus = options.acceptedStatuses?.includes(response.status) ?? false;
      if (response.status === 204 && (response.ok || acceptedStatus)) return null;

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        if (options.allowEmptyBody && (response.ok || acceptedStatus)) {
          return null;
        }
        if (isAbortError(error)) {
          throw new AvatarProviderTimeoutError("Live Avatar request timed out", error);
        }
        if (!response.ok) {
          throw new AvatarProviderError(`Live Avatar returned ${response.status}`, error, response.status);
        }
        throw new AvatarProviderError("Live Avatar returned invalid JSON", error);
      }

      if (!response.ok && !acceptedStatus) {
        throw new AvatarProviderError(
          formatLiveAvatarError(response.status, body),
          undefined,
          response.status
        );
      }

      if (acceptedStatus) return body;

      const bodyError = readLiveAvatarBodyError(body);
      if (bodyError) {
        throw new AvatarProviderError(bodyError);
      }

      return body;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export type ProviderTokenProtector = {
  encrypt(token: string): string;
  decrypt(ciphertext: string): string;
};

export function createProviderTokenProtector(secret: string): ProviderTokenProtector {
  const key = createHash("sha256").update(secret).digest();

  return {
    encrypt(token) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
      return [
        "v1",
        iv.toString("base64url"),
        cipher.getAuthTag().toString("base64url"),
        encrypted.toString("base64url"),
      ].join(".");
    },
    decrypt(ciphertext) {
      const [version, encodedIv, encodedTag, encodedValue] = ciphertext.split(".");
      if (version !== "v1" || !encodedIv || !encodedTag || !encodedValue) {
        throw new Error("Invalid encrypted provider token");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encodedIv, "base64url"));
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
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

  async createLiteSessionToken(): Promise<LiveAvatarLiteSessionToken> {
    if (this.error) {
      throw this.error;
    }

    return {
      sessionToken: "mock-liveavatar-session-token",
      sessionId: "mock-liveavatar-session",
    };
  }

  async stopSession(): Promise<void> {
    if (this.error) throw this.error;
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

function extractSessionToken(body: unknown): LiveAvatarLiteSessionToken | null {
  const data = isRecord(body) ? body.data : null;
  const candidate = isRecord(data) ? data : isRecord(body) ? body : null;

  if (!candidate) {
    return null;
  }

  const sessionToken = readString(candidate.session_token) ?? readString(candidate.sessionToken);

  if (!sessionToken) {
    return null;
  }

  return {
    sessionToken,
    sessionId: readString(candidate.session_id) ?? readString(candidate.sessionId),
  };
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

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatLiveAvatarError(status: number, body: unknown): string {
  const bodyMessage = readLiveAvatarBodyMessage(body);

  return bodyMessage ? `Live Avatar returned ${status}: ${bodyMessage}` : `Live Avatar returned ${status}`;
}

function readLiveAvatarBodyError(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const code = readNumber(body.code);
  const message = readLiveAvatarBodyMessage(body);

  if (code !== null && code !== 100 && code !== 1000 && message) {
    return `Live Avatar returned code ${code}: ${message}`;
  }

  return null;
}

function readLiveAvatarBodyMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }

  const message =
    readString(body.message) ??
    readString(body.detail) ??
    (isRecord(body.error) ? readString(body.error.message) : null) ??
    readString(body.error);
  const dataMessage = readLiveAvatarDataMessage(body.data);

  if (message && dataMessage && isGenericLiveAvatarMessage(message)) {
    return dataMessage;
  }

  if (message && dataMessage && message !== dataMessage) {
    return `${message}: ${dataMessage}`;
  }

  if (message) {
    return message;
  }

  return dataMessage;
}

function readLiveAvatarDataMessage(data: unknown): string | null {
  if (Array.isArray(data)) {
    const messages = data
      .map(readLiveAvatarIssueMessage)
      .filter((message): message is string => message !== null);

    return messages.length > 0 ? messages.join("; ") : null;
  }

  if (isRecord(data)) {
    return readString(data.message) ?? readString(data.error);
  }

  return null;
}

function readLiveAvatarIssueMessage(issue: unknown): string | null {
  if (!isRecord(issue)) {
    return null;
  }

  const message = readString(issue.message) ?? readString(issue.msg) ?? readString(issue.error);
  if (!message) {
    return null;
  }

  const loc = Array.isArray(issue.loc)
    ? issue.loc
        .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : null))
        .filter((part): part is string => part !== null)
        .join(".")
    : "";

  return loc.length > 0 ? `${loc}: ${message}` : message;
}

function isGenericLiveAvatarMessage(message: string): boolean {
  return message.toLowerCase() === "bad request error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}
