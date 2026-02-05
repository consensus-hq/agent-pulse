export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetMs: number;
};

export function createRateLimiter(config: RateLimitConfig) {
  const windowMs = config.windowMs;
  const maxRequests = config.maxRequests;
  const store = new Map<string, number[]>();
  let lastCleanup = 0;

  function cleanup(now: number) {
    if (now - lastCleanup < windowMs) return;
    const windowStart = now - windowMs;
    for (const [key, timestamps] of store.entries()) {
      const filtered = timestamps.filter((ts) => ts > windowStart);
      if (filtered.length === 0) {
        store.delete(key);
      } else {
        store.set(key, filtered);
      }
    }
    lastCleanup = now;
  }

  function check(key: string): RateLimitResult {
    const now = Date.now();
    cleanup(now);
    const windowStart = now - windowMs;
    const timestamps = store.get(key) ?? [];
    const filtered = timestamps.filter((ts) => ts > windowStart);
    if (filtered.length >= maxRequests) {
      const earliest = filtered[0] ?? now;
      const resetMs = Math.max(0, windowMs - (now - earliest));
      store.set(key, filtered);
      return { allowed: false, remaining: 0, resetMs };
    }
    filtered.push(now);
    store.set(key, filtered);
    const earliest = filtered[0] ?? now;
    const resetMs = Math.max(0, windowMs - (now - earliest));
    return { allowed: true, remaining: maxRequests - filtered.length, resetMs };
  }

  return { check };
}
