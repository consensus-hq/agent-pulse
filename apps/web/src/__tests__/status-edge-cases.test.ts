import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/kv", () => ({
  kv: {
    incr: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    multi: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    })),
  },
}));

vi.mock("@/app/lib/kv", () => ({
  KV_TTL_ISALIVE_SECONDS: 3600,
  getAgentState: vi.fn(),
  setAgentState: vi.fn(),
  checkKVHealth: vi.fn(),
  getPauseState: vi.fn(),
  getTotalAgents: vi.fn(),
}));

vi.mock("@/app/lib/chain", () => ({
  readAgentStatus: vi.fn(),
  readTTL: vi.fn(),
  readPauseState: vi.fn(),
  readTotalAgents: vi.fn(),
}));

describe("GET /api/status/:address edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Invalid address format", () => {
    it("returns 400 for address without 0x prefix", async () => {
      const { kv } = await import("@vercel/kv");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);

      const address = "1111111111111111111111111111111111111111"; // no 0x
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { error: string; status: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid Ethereum address");
      expect(body.status).toBe("invalid");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("returns 400 for address with wrong length (too short)", async () => {
      const { kv } = await import("@vercel/kv");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);

      const address = "0x1234"; // too short
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { error: string; status: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid Ethereum address");
      expect(body.status).toBe("invalid");
    });

    it("returns 400 for address with wrong length (too long)", async () => {
      const { kv } = await import("@vercel/kv");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);

      const address = "0x" + "1".repeat(50); // too long
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { error: string; status: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid Ethereum address");
      expect(body.status).toBe("invalid");
    });

    it("returns 400 for address with invalid characters", async () => {
      const { kv } = await import("@vercel/kv");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);

      const address = "0x" + "g".repeat(40); // invalid hex characters
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { error: string; status: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid Ethereum address");
      expect(body.status).toBe("invalid");
    });
  });

  describe("Zero address handling", () => {
    it("accepts zero address as valid format", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState, setAgentState } = await import("@/app/lib/kv");
      const { readTTL, readAgentStatus } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue(null); // cache miss
      vi.mocked(readTTL).mockResolvedValue(86400n);
      vi.mocked(readAgentStatus).mockResolvedValue({
        alive: false,
        lastPulseAt: 0n,
        streak: 0n,
        hazardScore: 0n,
      });
      vi.mocked(setAgentState).mockResolvedValue(undefined);

      const address = "0x" + "0".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Address case handling", () => {
    it("accepts checksummed address", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B"; // checksummed
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { address: string };

      expect(response.status).toBe(200);
      expect(body.address).toBe(address.toLowerCase());
    });

    it("accepts lowercase address", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "a".repeat(40); // all lowercase
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { address: string };

      expect(response.status).toBe(200);
      expect(body.address).toBe(address);
    });

    it("accepts uppercase hex characters", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "A".repeat(40); // all uppercase
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { address: string };

      expect(response.status).toBe(200);
      expect(body.address).toBe(address.toLowerCase());
    });
  });

  describe("Chain/KV unavailable", () => {
    it("returns 503 when chain read fails", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readAgentStatus } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue(null); // cache miss
      vi.mocked(readAgentStatus).mockResolvedValue(null); // chain unavailable

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { error: string; status: string };

      expect(response.status).toBe(503);
      expect(body.error).toContain("Failed to fetch agent status");
      expect(body.status).toBe("unavailable");
      expect(response.headers.get("Retry-After")).toBe("5");
    });
  });

  describe("Response schema validation", () => {
    it("returns all expected fields on cache hit", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 5,
        hazardScore: 25,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("address");
      expect(body).toHaveProperty("isAlive");
      expect(body).toHaveProperty("streak");
      expect(body).toHaveProperty("lastPulse");
      expect(body).toHaveProperty("hazardScore");
      expect(body).toHaveProperty("ttlSeconds");
      expect(body).toHaveProperty("source");
      expect(body).toHaveProperty("updatedAt");

      expect(typeof body.address).toBe("string");
      expect(typeof body.isAlive).toBe("boolean");
      expect(typeof body.streak).toBe("number");
      expect(typeof body.lastPulse).toBe("number");
      expect(typeof body.hazardScore).toBe("number");
      expect(typeof body.ttlSeconds).toBe("number");
      expect(body.source).toBe("cache");
      expect(typeof body.updatedAt).toBe("number");
    });

    it("returns all expected fields on cache miss (chain read)", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState, setAgentState } = await import("@/app/lib/kv");
      const { readAgentStatus, readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue(null); // cache miss
      vi.mocked(readTTL).mockResolvedValue(86400n);
      vi.mocked(readAgentStatus).mockResolvedValue({
        alive: true,
        lastPulseAt: 1710000000n,
        streak: 3n,
        hazardScore: 10n,
      });
      vi.mocked(setAgentState).mockResolvedValue(undefined);

      const address = "0x" + "2".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("address");
      expect(body).toHaveProperty("isAlive");
      expect(body).toHaveProperty("streak");
      expect(body).toHaveProperty("lastPulse");
      expect(body).toHaveProperty("hazardScore");
      expect(body).toHaveProperty("ttlSeconds");
      expect(body).toHaveProperty("source");
      expect(body).toHaveProperty("updatedAt");

      expect(body.source).toBe("chain");
    });
  });

  describe("Cache headers", () => {
    it("includes no-store Cache-Control header on success", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("includes X-Cache-Status header on cache hit", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      expect(response.headers.get("X-Cache-Status")).toBe("HIT");
    });

    it("includes X-Cache-Status header on cache miss", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState, setAgentState } = await import("@/app/lib/kv");
      const { readAgentStatus, readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue(null); // cache miss
      vi.mocked(readTTL).mockResolvedValue(86400n);
      vi.mocked(readAgentStatus).mockResolvedValue({
        alive: true,
        lastPulseAt: 1710000000n,
        streak: 3n,
        hazardScore: 10n,
      });
      vi.mocked(setAgentState).mockResolvedValue(undefined);

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      expect(response.headers.get("X-Cache-Status")).toBe("MISS");
    });
  });

  describe("Rate limiting", () => {
    it("includes rate limit headers when under limit", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(5); // 5th request
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("95");
    });

    it("returns 429 when rate limit exceeded", async () => {
      const { kv } = await import("@vercel/kv");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockResolvedValue(101); // over the 100 limit

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      const body = (await response.json()) as { error: string; status: string };

      expect(response.status).toBe(429);
      expect(body.error).toBe("Rate limit exceeded");
      expect(body.status).toBe("rate_limited");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
      expect(response.headers.has("X-RateLimit-Reset")).toBe(true);
    });

    it("handles multiple rapid requests from same IP", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      let requestCount = 0;
      vi.mocked(kv.incr).mockImplementation(async () => {
        return ++requestCount;
      });
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "1".repeat(40);
      const ip = "192.168.1.100";

      // Send 5 rapid requests
      const requests = Array.from({ length: 5 }, () =>
        new Request(`https://example.com/api/status/${address}`, {
          headers: { "x-forwarded-for": ip },
        })
      );

      const responses = await Promise.all(
        requests.map((req) =>
          GET(req as unknown as never, {
            params: Promise.resolve({ address }),
          })
        )
      );

      // All should succeed but with decreasing remaining counts
      expect(responses[0].headers.get("X-RateLimit-Remaining")).toBe("99");
      expect(responses[1].headers.get("X-RateLimit-Remaining")).toBe("98");
      expect(responses[2].headers.get("X-RateLimit-Remaining")).toBe("97");
      expect(responses[3].headers.get("X-RateLimit-Remaining")).toBe("96");
      expect(responses[4].headers.get("X-RateLimit-Remaining")).toBe("95");

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it("handles KV failure gracefully (fail open)", async () => {
      const { kv } = await import("@vercel/kv");
      const { getAgentState } = await import("@/app/lib/kv");
      const { readTTL } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/status/[address]/route");

      vi.mocked(kv.incr).mockRejectedValue(new Error("KV unavailable"));
      vi.mocked(getAgentState).mockResolvedValue({
        isAlive: true,
        lastPulse: 1710000000,
        streak: 2,
        hazardScore: 0,
      });
      vi.mocked(readTTL).mockResolvedValue(86400n);

      const address = "0x" + "1".repeat(40);
      const request = new Request(`https://example.com/api/status/${address}`, {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never, {
        params: Promise.resolve({ address }),
      });

      // Should still succeed due to fail-open behavior
      expect(response.status).toBe(200);
    });
  });
});
