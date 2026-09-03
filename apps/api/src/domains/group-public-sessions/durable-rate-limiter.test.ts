import { describe, expect, it, vi } from "vitest";
import type { GroupPublicRateLimitBucketRule, GroupPublicRateLimitResult } from "@yuni/db";
import { createDurableGroupRateLimiter } from "./durable-rate-limiter";

describe("durable public group rate-limit adapter", () => {
  it("sends only fixed-window HMAC bucket keys to persistence", async () => {
    const consume = vi.fn(
      async (
        _rules: GroupPublicRateLimitBucketRule[],
        _evaluatedAt?: Date
      ): Promise<GroupPublicRateLimitResult> => ({ allowed: true })
    );
    const cleanupExpired = vi.fn(async (_evaluatedAt?: Date) => ({ count: 2 }));
    const now = Date.parse("2026-08-31T12:07:30.000Z");
    const limiter = createDurableGroupRateLimiter({
      repository: { consume, cleanupExpired },
      secret: "test-rate-limit-secret",
      now: () => now,
    });

    await expect(
      limiter.consume([
        {
          namespace: "group-public-identify-ip-link",
          identifiers: ["203.0.113.8", "link-sensitive-id"],
          limit: 5,
          windowMs: 15 * 60_000,
        },
        {
          namespace: "group-public-identify-email-link",
          identifiers: ["person@example.com", "link-sensitive-id"],
          limit: 3,
          windowMs: 15 * 60_000,
        },
      ])
    ).resolves.toEqual({ allowed: true });

    expect(consume).toHaveBeenCalledTimes(1);
    const [buckets, evaluatedAt] = consume.mock.calls[0]!;
    expect(evaluatedAt).toEqual(new Date(now));
    expect(buckets).toHaveLength(2);
    expect(buckets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyHash: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
          windowStartedAt: new Date("2026-08-31T12:00:00.000Z"),
          expiresAt: new Date("2026-08-31T12:15:00.000Z"),
        }),
      ])
    );
    expect(JSON.stringify(buckets)).not.toContain("203.0.113.8");
    expect(JSON.stringify(buckets)).not.toContain("person@example.com");
    expect(JSON.stringify(buckets)).not.toContain("link-sensitive-id");

    await expect(limiter.cleanupExpired?.()).resolves.toEqual({ count: 2 });
    expect(cleanupExpired).toHaveBeenCalledWith(new Date(now));
  });

  it("uses a new opaque bucket after the fixed window and preserves retryAfter", async () => {
    let now = Date.parse("2026-08-31T12:14:59.000Z");
    const consume = vi
      .fn(
        async (
          _rules: GroupPublicRateLimitBucketRule[],
          _evaluatedAt?: Date
        ): Promise<GroupPublicRateLimitResult> => ({ allowed: true })
      )
      .mockResolvedValueOnce({ allowed: true as const })
      .mockResolvedValueOnce({ allowed: false as const, retryAfterSeconds: 47 });
    const cleanupExpired = vi.fn(async (_evaluatedAt?: Date) => ({ count: 0 }));
    const limiter = createDurableGroupRateLimiter({
      repository: { consume, cleanupExpired },
      secret: "test-rate-limit-secret",
      now: () => now,
    });
    const rules = [
      {
        namespace: "group-public-start-link",
        identifiers: ["link-1"],
        limit: 10,
        windowMs: 15 * 60_000,
      },
    ];

    await expect(limiter.consume(rules)).resolves.toEqual({ allowed: true });
    now += 1_000;
    await expect(limiter.consume(rules)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 47,
    });

    const firstKey = consume.mock.calls[0]![0][0]!.keyHash;
    const secondKey = consume.mock.calls[1]![0][0]!.keyHash;
    expect(firstKey).not.toBe(secondKey);
  });
});
