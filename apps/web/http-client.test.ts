import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function unauthorizedResponse(reason: string) {
  return new Response(
    JSON.stringify({
      error: {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        reason,
      },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}

describe("web API session expiration", () => {
  let replace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(["SESSION_REQUIRED", "SESSION_INVALID"])(
    "hard redirects once for concurrent %s responses",
    async (reason) => {
      const fetchMock = vi.fn(async () => unauthorizedResponse(reason));
      vi.stubGlobal("fetch", fetchMock);
      const { apiRequest } = await import("./lib/api/http-client");

      const results = await Promise.allSettled([
        apiRequest("/avatars"),
        apiRequest("/dashboard/creator-summary"),
        apiRequest("/avatar-groups"),
      ]);

      expect(results.every((result) => result.status === "rejected")).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith("/auth/login?reason=session-expired");
    }
  );

  it("does not expire the creator session for invalid login credentials", async () => {
    const fetchMock = vi.fn(async () => unauthorizedResponse("SESSION_INVALID"));
    vi.stubGlobal("fetch", fetchMock);
    const { login } = await import("./lib/api/auth-api");

    await expect(login({ email: "demo@yuni.local", password: "invalid-password" })).rejects.toMatchObject({
      status: 401,
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("does not expire the creator session for an invalid public bearer token", async () => {
    const fetchMock = vi.fn(async () => unauthorizedResponse("SESSION_INVALID"));
    vi.stubGlobal("fetch", fetchMock);
    const { startPublicSession } = await import("./lib/api/sharing-api");

    await expect(startPublicSession("demo", "expired-public-token")).rejects.toMatchObject({
      status: 401,
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("does not redirect for a 401 without a user-session reason", async () => {
    const fetchMock = vi.fn(async () => unauthorizedResponse("PUBLIC_TOKEN_INVALID"));
    vi.stubGlobal("fetch", fetchMock);
    const { apiRequest } = await import("./lib/api/http-client");

    await expect(apiRequest("/avatars")).rejects.toMatchObject({ status: 401 });

    expect(replace).not.toHaveBeenCalled();
  });
});
