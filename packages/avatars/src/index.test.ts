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

  it("throws provider errors when Live Avatar fails", async () => {
    const provider = new LiveAvatarProvider({
      config,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "nope" }, { status: 500 })),
    });

    await expect(provider.listAvatars()).rejects.toBeInstanceOf(AvatarProviderError);
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
    await expect(new MockAvatarProvider({ error: new Error("boom") }).listAvatars()).rejects.toThrow("boom");
  });
});
