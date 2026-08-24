import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestLogger, shouldIncludeErrorStack, toSafeLoggedError } from "./middleware/request-logger";

describe("request logger hardening", () => {
  afterEach(() => vi.restoreAllMocks());

  it("omits stacks whenever the application or Node runtime is production", () => {
    expect(shouldIncludeErrorStack({ appEnv: "production", nodeEnv: "development" })).toBe(false);
    expect(shouldIncludeErrorStack({ appEnv: "staging", nodeEnv: "production" })).toBe(false);
    expect(shouldIncludeErrorStack({ appEnv: "development", nodeEnv: "development" })).toBe(true);
  });

  it("redacts sensitive values from development errors and hides production details", () => {
    const error = new Error("Bearer private-token failed for Person@Example.com with apiKey=super-secret");
    const development = JSON.stringify(
      toSafeLoggedError(error, { appEnv: "development", nodeEnv: "development" })
    );
    const production = toSafeLoggedError(error, { appEnv: "production", nodeEnv: "production" });

    expect(development).not.toContain("private-token");
    expect(development).not.toContain("Person@Example.com");
    expect(development).not.toContain("super-secret");
    expect(production).toEqual({ name: "Error", message: "Internal request error" });
  });

  it("redacts emails and secrets embedded in non-sensitive query and header values", async () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => output.push(String(value)));
    const app = new Hono();
    app.use("*", requestLogger());
    app.get("/probe", (context) => context.json({ ok: true }));

    await app.request("/probe?search=Person%40Example.com", {
      headers: { "X-Debug-Note": "apiKey=super-secret for Other@Example.com" },
    });

    const logs = output.join("\n");
    expect(logs).not.toContain("Person@Example.com");
    expect(logs).not.toContain("Other@Example.com");
    expect(logs).not.toContain("super-secret");
    expect(logs).toContain("[redacted]");
  });
});
