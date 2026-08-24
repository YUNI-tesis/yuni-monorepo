import { describe, expect, it } from "vitest";
import { resolveClientIp } from "./middleware/client-ip";

describe("external client IP resolution", () => {
  it("uses the direct Node connection when no proxy is trusted", () => {
    expect(resolveClientIp("203.0.113.10", "198.51.100.20", 0)).toBe("203.0.113.10");
  });

  it("selects the configured trusted proxy hop for IPv4 and IPv6", () => {
    expect(resolveClientIp("10.0.0.3", "203.0.113.10, 10.0.0.2", 2)).toBe("203.0.113.10");
    expect(resolveClientIp("2001:db8::3", "2001:db8::1, 2001:db8::2", 2)).toBe("2001:db8::1");
  });

  it("does not shift hops around invalid forwarded values", () => {
    expect(resolveClientIp("10.0.0.3", "203.0.113.10, forged", 2)).toBe("10.0.0.3");
  });

  it("falls back safely for invalid direct and forwarded addresses", () => {
    expect(resolveClientIp("not-an-ip", "also-invalid", 1)).toBe("unknown");
  });
});
