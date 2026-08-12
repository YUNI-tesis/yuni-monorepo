export type PublicSessionRateLimiter = {
  consume(input: { avatarId: string; shareLinkId: string; ip: string }):
    | { allowed: true }
    | { allowed: false; retryAfterSeconds: number };
};

export function createInMemoryPublicSessionRateLimiter(options: {
  maxPerAvatar: number;
  maxPerIpAndLink: number;
  windowMs?: number;
  now?: () => number;
}): PublicSessionRateLimiter {
  const attempts = new Map<string, number[]>();
  const windowMs = options.windowMs ?? 60 * 60 * 1000;
  const now = options.now ?? Date.now;
  const sweepIntervalMs = Math.min(windowMs, 60_000);
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  const sweepExpiredKeys = (timestamp: number) => {
    if (timestamp - lastSweepAt < sweepIntervalMs) return;
    for (const [key, values] of attempts) {
      const current = values.filter((value) => timestamp - value < windowMs);
      if (current.length === 0) attempts.delete(key);
      else attempts.set(key, current);
    }
    lastSweepAt = timestamp;
  };

  return {
    consume(input) {
      const timestamp = now();
      sweepExpiredKeys(timestamp);
      const checks = [
        { key: `avatar:${input.avatarId}`, limit: options.maxPerAvatar },
        { key: `ip-link:${input.ip}:${input.shareLinkId}`, limit: options.maxPerIpAndLink },
      ];

      for (const check of checks) {
        const current = (attempts.get(check.key) ?? []).filter((value) => timestamp - value < windowMs);
        attempts.set(check.key, current);
        if (current.length >= check.limit) {
          const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (timestamp - current[0]!)) / 1000));
          return { allowed: false, retryAfterSeconds };
        }
      }

      for (const check of checks) {
        attempts.set(check.key, [...(attempts.get(check.key) ?? []), timestamp]);
      }
      return { allowed: true };
    },
  };
}
