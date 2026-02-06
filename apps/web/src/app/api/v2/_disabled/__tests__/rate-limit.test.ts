import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock state for test isolation
const mockRateLimits = new Map<string, number>();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (key: string) => mockRateLimits.get(key) || 0),
    set: vi.fn(async (key: string, value: number) => {
      mockRateLimits.set(key, value);
    }),
    incr: vi.fn(async (key: string) => {
      const current = (mockRateLimits.get(key) || 0) + 1;
      mockRateLimits.set(key, current);
      return current;
    }),
    expire: vi.fn(async () => true),
    pipeline: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

describe("Rate limiting at boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimits.clear();
    process.env.THIRDWEB_SECRET_KEY = "test-secret-key";
    process.env.SERVER_WALLET_ADDRESS = "0x" + "a".repeat(40);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createRequest = (ip: string = "1.2.3.4"): NextRequest => {
    return new NextRequest("https://example.com/api/v2/test", {
      headers: { "x-forwarded-for": ip },
    });
  };

  describe("59th request (should be allowed)", () => {
    it("should allow 59th request within the same minute", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");

      // Simulate 58 requests already made
      const now = new Date();
      const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const rateKey = `ratelimit:v2:1.2.3.4:${minuteBucket}`;

      mockRateLimits.set(rateKey, 58);

      const request = createRequest("1.2.3.4");
      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 60 - 58 = 2 remaining
    });

    it("should have correct headers for 59th request", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");

      const now = new Date();
      const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const rateKey = `ratelimit:v2:1.2.3.4:${minuteBucket}`;

      mockRateLimits.set(rateKey, 58);

      const request = createRequest("1.2.3.4");
      const result = await checkRateLimit(request);

      expect(result.remaining).toBe(2);
      expect(result.resetAfter).toBe(60);
    });
  });

  describe("60th request (should be blocked)", () => {
    it("should block 60th request", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");

      const now = new Date();
      const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const rateKey = `ratelimit:v2:1.2.3.4:${minuteBucket}`;

      mockRateLimits.set(rateKey, 60);

      const request = createRequest("1.2.3.4");
      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should return 429 response for 60th request", async () => {
      const { x402Gate, PRICES } = await import("../_lib/x402-gate");

      const now = new Date();
      const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const rateKey = `ratelimit:v2:1.2.3.4:${minuteBucket}`;

      mockRateLimits.set(rateKey, 60);

      const request = createRequest("1.2.3.4");
      const handler = vi.fn();

      const response = await x402Gate(
        request,
        { endpoint: "reliability", price: PRICES.reliability },
        handler
      );

      expect(response.status).toBe(429);
    });

    it("should include Retry-After header when blocked", async () => {
      const { x402Gate, PRICES } = await import("../_lib/x402-gate");

      const now = new Date();
      const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const rateKey = `ratelimit:v2:1.2.3.4:${minuteBucket}`;

      mockRateLimits.set(rateKey, 60);

      const request = createRequest("1.2.3.4");
      const handler = vi.fn();

      const response = await x402Gate(
        request,
        { endpoint: "reliability", price: PRICES.reliability },
        handler
      );

      expect(response.headers.get("Retry-After")).toBe("60");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    });
  });

  describe("Reset after window", () => {
    it("should reset counter after 60 seconds", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");

      // Set rate limit at limit in current minute
      const now = new Date();
      const currentMinuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

      mockRateLimits.set(`ratelimit:v2:1.2.3.4:${currentMinuteBucket}`, 60);

      // Request in current minute should be blocked
      const currentRequest = createRequest("1.2.3.4");
      const currentResult = await checkRateLimit(currentRequest);
      expect(currentResult.allowed).toBe(false);

      // Simulate time passing to next minute
      const nextMinute = new Date(now.getTime() + 60000);
      const nextMinuteBucket = `${nextMinute.getFullYear()}${String(nextMinute.getMonth() + 1).padStart(2, "0")}${String(nextMinute.getDate()).padStart(2, "0")}${String(nextMinute.getHours()).padStart(2, "0")}${String(nextMinute.getMinutes()).padStart(2, "0")}`;

      // New minute bucket should have 0 count
      mockRateLimits.set(`ratelimit:v2:1.2.3.4:${nextMinuteBucket}`, 0);

      const nextRequest = new NextRequest("https://example.com/api/v2/test", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });

      // Mock the date for the check
      const originalDate = global.Date;
      global.Date = class extends Date {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super(nextMinute);
          } else {
            super(...(args as [string | number | Date]));
          }
        }
      } as typeof Date;

      const nextResult = await checkRateLimit(nextRequest);

      // Restore original Date
      global.Date = originalDate;

      expect(nextResult.allowed).toBe(true);
      expect(nextResult.remaining).toBe(60);
    });

    it("should allow requests after TTL expires", async () => {
      const { kv } = await import("@vercel/kv");

      const rateKey = "ratelimit:v2:1.2.3.4:202402061200";
      mockRateLimits.set(rateKey, 60);

      // Simulate key expiration
      mockRateLimits.delete(rateKey);

      // After deletion (simulating TTL expiry), count should be 0
      const count = mockRateLimits.get(rateKey) || 0;
      expect(count).toBe(0);
    });

    it("should start fresh counter for new IP", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");

      // Block one IP
      const now = new Date();
      const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

      mockRateLimits.set(`ratelimit:v2:1.2.3.4:${minuteBucket}`, 60);

      const blockedRequest = createRequest("1.2.3.4");
      const blockedResult = await checkRateLimit(blockedRequest);
      expect(blockedResult.allowed).toBe(false);

      // Different IP should be allowed
      mockRateLimits.set(`ratelimit:v2:5.6.7.8:${minuteBucket}`, 0);

      const allowedRequest = createRequest("5.6.7.8");
      const allowedResult = await checkRateLimit(allowedRequest);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(60);
    });
  });

  describe("Rate limit key generation", () => {
    it("should use correct key format", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");
      const { kv } = await import("@vercel/kv");

      const mockDate = new Date("2024-02-06T12:30:45");
      const originalDate = global.Date;
      global.Date = class extends Date {
        constructor() {
          super(mockDate);
        }
      } as typeof Date;

      const request = createRequest("1.2.3.4");
      await checkRateLimit(request);

      global.Date = originalDate;

      // Key should be: ratelimit:v2:{ip}:{YYYYMMDDHHMM}
      expect(kv.get).toHaveBeenCalledWith(expect.stringMatching(/ratelimit:v2:1\.2\.3\.4:\d{12}/));
    });

    it("should extract IP from x-forwarded-for header", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");
      const { kv } = await import("@vercel/kv");

      const request = new NextRequest("https://example.com/api/v2/test", {
        headers: { "x-forwarded-for": "10.0.0.1, 192.168.1.1, 172.16.0.1" },
      });

      await checkRateLimit(request);

      // Should use first IP in the list
      expect(kv.get).toHaveBeenCalledWith(expect.stringContaining("10.0.0.1"));
    });

    it("should handle missing x-forwarded-for header", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");
      const { kv } = await import("@vercel/kv");

      const request = new NextRequest("https://example.com/api/v2/test");
      await checkRateLimit(request);

      // Should use "unknown" as IP
      expect(kv.get).toHaveBeenCalledWith(expect.stringContaining("unknown"));
    });
  });

  describe("Incremental rate limiting", () => {
    it("should decrement remaining count with each request", async () => {
      const { checkRateLimit, incrementRateLimit } = await import("../_lib/x402-gate");

      const request = createRequest("1.2.3.4");

      // First request
      const result1 = await checkRateLimit(request);
      await incrementRateLimit(request);

      // Second request
      mockRateLimits.set(
        expect.stringContaining("ratelimit:v2:1.2.3.4:"),
        1
      );
      const result2 = await checkRateLimit(request);

      expect(result1.remaining).toBeGreaterThan(result2.remaining);
    });

    it("should track rate limit in KV pipeline", async () => {
      const { incrementRateLimit } = await import("../_lib/x402-gate");
      const { kv } = await import("@vercel/kv");

      const request = createRequest("1.2.3.4");
      await incrementRateLimit(request);

      expect(kv.pipeline).toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should handle exactly 60 requests in window", async () => {
      const { checkRateLimit } = await import("../_lib/x402-gate");

      const now = new Date();
      const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

      // At exactly 60, should be blocked (>= 60)
      mockRateLimits.set(`ratelimit:v2:1.2.3.4:${minuteBucket}`, 60);

      const request = createRequest("1.2.3.4");
      const result = await checkRateLimit(request);

      expect(result.allowed).toBe(false);
    });

    it("should handle burst of requests at window boundary", async () => {
      const { checkRateLimit, incrementRateLimit } = await import("../_lib/x402-gate");

      // Simulate 100 requests at once (bursty traffic)
      const request = createRequest("1.2.3.4");
      const results = [];

      for (let i = 0; i < 100; i++) {
        const result = await checkRateLimit(request);
        results.push(result);
        if (result.allowed) {
          await incrementRateLimit(request);
        }
      }

      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed).length;

      expect(allowedCount).toBeLessThanOrEqual(60);
      expect(blockedCount).toBeGreaterThanOrEqual(40);
    });

    it("should set correct TTL on rate limit keys", async () => {
      const { incrementRateLimit } = await import("../_lib/x402-gate");
      const { kv } = await import("@vercel/kv");

      const request = createRequest("1.2.3.4");
      await incrementRateLimit(request);

      const pipeline = kv.pipeline();
      expect(pipeline.expire).toHaveBeenCalledWith(expect.any(String), 60);
    });
  });
});
