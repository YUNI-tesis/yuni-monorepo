import { describe, expect, it, vi } from "vitest";
import {
  AvatarProviderError,
  AvatarProviderTimeoutError,
  AvatarProviderUnavailableError,
  LiveAvatarProvider,
  MockAvatarProvider,
  type AvatarOption,
} from "./index";

const config = {
  apiKey: "liveavatar-key",
  baseUrl: "https://api.liveavatar.test",
  mode: "full" as const,
  sandbox: false,
  requestTimeoutMs: 10000,
  elevenLabsSecretId: "secret-1",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("@yuni/avatars", () => {
  it("lists public avatars with the Live Avatar API key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "public-1",
            display_name: "Public Avatar",
            thumbnail_url: "https://cdn.liveavatar.test/public.png",
          },
        ],
      })
    );
    const provider = new LiveAvatarProvider({ config, fetch: fetcher });

    const avatars = await provider.listAvatars();

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.liveavatar.test/v1/avatars/public"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-KEY": "liveavatar-key" }),
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(avatars).toEqual([
      {
        id: "public-1",
        displayName: "Public Avatar",
        thumbnailUrl: "https://cdn.liveavatar.test/public.png",
        provider: "liveavatar",
        mode: "full",
        sandbox: false,
      },
    ]);
  });

  it("normalizes invalid provider items safely", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        avatars: [{ avatarId: "same", displayName: "First" }, { name: "No id" }, null],
      })
    );
    const provider = new LiveAvatarProvider({ config, fetch: fetcher });

    await expect(provider.listAvatars()).resolves.toEqual([
      {
        id: "same",
        displayName: "First",
        thumbnailUrl: null,
        provider: "liveavatar",
        mode: "full",
        sandbox: false,
      },
    ]);
  });

  it("normalizes nested public avatar responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        code: 1000,
        data: {
          public_avatar_list: [
            {
              avatar_id: "public-nested",
              name: "Nested Public",
              cover_img_url: "https://cdn.liveavatar.test/cover.png",
            },
          ],
        },
        message: "ok",
      })
    );
    const provider = new LiveAvatarProvider({ config, fetch: fetcher });

    await expect(provider.listAvatars()).resolves.toEqual([
      {
        id: "public-nested",
        displayName: "Nested Public",
        thumbnailUrl: "https://cdn.liveavatar.test/cover.png",
        provider: "liveavatar",
        mode: "full",
        sandbox: false,
      },
    ]);
  });

  it("throws unavailable when Live Avatar has no API key", async () => {
    const provider = new LiveAvatarProvider({
      config: { ...config, apiKey: "" },
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(provider.listAvatars()).rejects.toBeInstanceOf(AvatarProviderUnavailableError);
  });

  it("creates a LITE session token for the ElevenLabs connector", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: {
          session_token: "liveavatar-session-token",
          session_id: "liveavatar-session-id",
        },
      })
    );
    const provider = new LiveAvatarProvider({ config, fetch: fetcher });

    const session = await provider.createLiteSessionToken({
      avatarId: "liveavatar-1",
      elevenLabsAgentId: "agent-1",
    });

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.liveavatar.test/v1/sessions/token"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-KEY": "liveavatar-key" }),
        body: JSON.stringify({
          mode: "LITE",
          avatar_id: "liveavatar-1",
          is_sandbox: false,
          elevenlabs_agent_config: {
            secret_id: "secret-1",
            agent_id: "agent-1",
          },
        }),
      })
    );
    expect(session).toEqual({
      sessionToken: "liveavatar-session-token",
      sessionId: "liveavatar-session-id",
    });
  });

  it("stops a session remotely using its short-lived bearer token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: {} }));
    const provider = new LiveAvatarProvider({ config, fetch: fetcher });

    await provider.stopSession("session-token");

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://api.liveavatar.test/v1/sessions/stop"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
      })
    );
  });

  it("preserves the provider status when stopping an already-ended session returns an empty body", async () => {
    const provider = new LiveAvatarProvider({
      config,
      fetch: vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 })),
    });

    await expect(provider.stopSession("already-ended-token")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("accepts an empty successful stop response", async () => {
    const provider = new LiveAvatarProvider({
      config,
      fetch: vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 204 })),
    });

    await expect(provider.stopSession("session-token")).resolves.toBeUndefined();
  });

  it("requires the Live Avatar ElevenLabs connector secret before creating a session token", async () => {
    const provider = new LiveAvatarProvider({
      config: { ...config, elevenLabsSecretId: "" },
      fetch: vi.fn<typeof fetch>(),
    });

    await expect(
      provider.createLiteSessionToken({
        avatarId: "liveavatar-1",
        elevenLabsAgentId: "agent-1",
      })
    ).rejects.toBeInstanceOf(AvatarProviderUnavailableError);
  });

  it("throws provider errors when Live Avatar fails", async () => {
    const provider = new LiveAvatarProvider({
      config,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "nope" }, { status: 500 })),
    });

    await expect(provider.listAvatars()).rejects.toMatchObject({
      message: "Live Avatar returned 500: nope",
      status: 500,
    });
  });

  it("surfaces Live Avatar validation details from data arrays", async () => {
    const provider = new LiveAvatarProvider({
      config,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            code: 4000,
            data: [
              {
                loc: ["avatar_id"],
                message: "This avatar is not supported in sandbox mode",
                params: { avatar_id: "liveavatar-1" },
              },
            ],
            message: "Bad request error",
          },
          { status: 400 }
        )
      ),
    });

    await expect(
      provider.createLiteSessionToken({
        avatarId: "liveavatar-1",
        elevenLabsAgentId: "agent-1",
      })
    ).rejects.toMatchObject({
      message: "Live Avatar returned 400: avatar_id: This avatar is not supported in sandbox mode",
      status: 400,
    });
  });

  it("surfaces Live Avatar application error messages from 200 responses", async () => {
    const provider = new LiveAvatarProvider({
      config,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          code: 4000,
          data: null,
          message: "Invalid secret_id",
        })
      ),
    });

    await expect(
      provider.createLiteSessionToken({
        avatarId: "liveavatar-1",
        elevenLabsAgentId: "agent-1",
      })
    ).rejects.toThrow(new AvatarProviderError("Live Avatar returned code 4000: Invalid secret_id"));
  });

  it("aborts Live Avatar requests after the configured timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>(
        (_, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal instanceof AbortSignal) {
              signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            }
          })
      );
      const provider = new LiveAvatarProvider({
        config: { ...config, requestTimeoutMs: 25 },
        fetch: fetcher,
      });

      const result = expect(provider.listAvatars()).rejects.toBeInstanceOf(AvatarProviderTimeoutError);
      await vi.advanceTimersByTimeAsync(25);

      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts slow Live Avatar response bodies after the configured timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 25);
          }),
      } as Response);
      const provider = new LiveAvatarProvider({
        config: { ...config, requestTimeoutMs: 25 },
        fetch: fetcher,
      });

      const result = expect(provider.listAvatars()).rejects.toBeInstanceOf(AvatarProviderTimeoutError);
      await vi.advanceTimersByTimeAsync(25);

      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports mock provider success and failure", async () => {
    const avatars: AvatarOption[] = [
      {
        id: "mock-1",
        displayName: "Mock",
        thumbnailUrl: null,
        provider: "liveavatar",
        mode: "lite",
        sandbox: true,
      },
    ];

    await expect(new MockAvatarProvider({ avatars }).listAvatars()).resolves.toEqual(avatars);
    await expect(new MockAvatarProvider({ avatars }).createLiteSessionToken()).resolves.toMatchObject({
      sessionToken: "mock-liveavatar-session-token",
    });
    await expect(new MockAvatarProvider({ error: new Error("boom") }).listAvatars()).rejects.toThrow("boom");
  });
});
