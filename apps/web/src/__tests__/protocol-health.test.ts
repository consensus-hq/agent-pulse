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
}));

vi.mock("@/app/lib/chain", () => ({
  readAgentStatus: vi.fn(),
  readTTL: vi.fn(),
  readPauseState: vi.fn(),
}));

vi.mock("@/app/lib/insight", () => ({
  getPulseEvents: vi.fn(),
  setAgentState: vi.fn(),
  setPauseState: vi.fn(),
}));

/** Helper: mock a successful Insight response with N unique agents */
function mockInsightAgents(count: number) {
  const events = Array.from({ length: count }, (_, i) => ({
    agent: `0x${String(i).padStart(40, "0")}`,
    amount: 1000000000000000000n,
    timestamp: 1770311798,
    streak: 1,
    blockNumber: 37271755,
    transactionHash: "0xabc",
    logIndex: i,
  }));
  return { data: events, meta: { totalEvents: count, page: 1, limit: 100, totalPages: 1, hasNextPage: false } };
}

describe("GET /api/protocol-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Successful response", () => {
    it("returns expected schema with all health indicators", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        paused: boolean;
        totalAgents: number;
        kvHealthy: boolean;
        rpcHealthy: boolean;
        status: string;
      };

      expect(response.status).toBe(200);
      expect(body).toHaveProperty("paused");
      expect(body).toHaveProperty("totalAgents");
      expect(body).toHaveProperty("kvHealthy");
      expect(body).toHaveProperty("rpcHealthy");
      expect(body).toHaveProperty("status");

      expect(typeof body.paused).toBe("boolean");
      expect(typeof body.totalAgents).toBe("number");
      expect(typeof body.kvHealthy).toBe("boolean");
      expect(typeof body.rpcHealthy).toBe("boolean");
      expect(typeof body.status).toBe("string");

      expect(body.paused).toBe(false);
      expect(body.totalAgents).toBe(42);
      expect(body.kvHealthy).toBe(true);
      expect(body.rpcHealthy).toBe(true);
      expect(body.status).toBe("healthy");
    });

    it("returns healthy status when both KV and RPC are healthy", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 3 });
      vi.mocked(getPauseState).mockResolvedValue(true);
      vi.mocked(readPauseState).mockResolvedValue(true);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(100));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        status: string;
        kvHealthy: boolean;
        rpcHealthy: boolean;
      };

      expect(response.status).toBe(200);
      expect(body.status).toBe("healthy");
      expect(body.kvHealthy).toBe(true);
      expect(body.rpcHealthy).toBe(true);
    });

    it("returns headers including rate limit and latency info", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(5);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 8 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(10));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("25");
      expect(response.headers.get("X-KV-Latency")).toBe("8");
      expect(response.headers.get("X-RPC-Latency")).toBeDefined();
      expect(response.headers.get("X-Data-Source")).toBe("kv");
    });
  });

  describe("Degraded state", () => {
    it("returns degraded status when KV is down but RPC is healthy", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: false, latencyMs: 0, error: "Connection refused" });
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        status: string;
        kvHealthy: boolean;
        rpcHealthy: boolean;
        paused: boolean;
        totalAgents: number;
      };

      expect(response.status).toBe(200);
      expect(body.status).toBe("degraded");
      expect(body.kvHealthy).toBe(false);
      expect(body.rpcHealthy).toBe(true);
      expect(body.paused).toBe(false);
      expect(body.totalAgents).toBe(42);
    });

    it("returns degraded status when RPC is down but KV is healthy", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(null); // RPC down
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        status: string;
        kvHealthy: boolean;
        rpcHealthy: boolean;
      };

      expect(response.status).toBe(200);
      expect(body.status).toBe("degraded");
      expect(body.kvHealthy).toBe(true);
      expect(body.rpcHealthy).toBe(false);
    });

    it("falls back to chain data when KV is down but RPC is healthy", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: false, latencyMs: 0, error: "KV unavailable" });
      vi.mocked(readPauseState).mockResolvedValue(true);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(5));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        paused: boolean;
        totalAgents: number;
        status: string;
      };

      expect(response.status).toBe(200);
      expect(body.paused).toBe(true);
      expect(body.totalAgents).toBe(5);
      expect(body.status).toBe("degraded");
      expect(response.headers.get("X-Data-Source")).toBe("chain");
    });
  });

  describe("Unhealthy state", () => {
    it("returns 503 when both KV and RPC are down", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: false, latencyMs: 0, error: "Connection refused" });
      vi.mocked(readPauseState).mockResolvedValue(null); // RPC down

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        error: string;
      };

      expect(response.status).toBe(503);
      expect(body.error).toContain("Service unavailable");
      expect(response.headers.get("Retry-After")).toBe("5");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("totalAgents from Insight API", () => {
    it("counts unique agents from Insight pulse events", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      // 3 events but only 2 unique agents (agent 0 appears twice)
      vi.mocked(getPulseEvents).mockResolvedValue({
        data: [
          { agent: "0x000a", amount: 1n, timestamp: 1, streak: 1, blockNumber: 1, transactionHash: "0x1", logIndex: 0 },
          { agent: "0x000b", amount: 1n, timestamp: 2, streak: 1, blockNumber: 2, transactionHash: "0x2", logIndex: 0 },
          { agent: "0x000a", amount: 1n, timestamp: 3, streak: 2, blockNumber: 3, transactionHash: "0x3", logIndex: 0 },
        ],
        meta: { totalEvents: 3, page: 1, limit: 100, totalPages: 1, hasNextPage: false },
      });

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { totalAgents: number };

      expect(response.status).toBe(200);
      expect(body.totalAgents).toBe(2);
    });

    it("returns 0 when Insight API fails", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockRejectedValue(new Error("Insight API down"));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { totalAgents: number };

      expect(response.status).toBe(200);
      expect(body.totalAgents).toBe(0);
    });
  });

  describe("Response time", () => {
    it("returns response within reasonable time threshold", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 10 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const startTime = Date.now();
      const response = await GET(request as unknown as never);
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("Rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      const { kv } = await import("@vercel/kv");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(31);

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(429);
      expect(body.error).toBe("Rate limit exceeded");
      expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.has("X-RateLimit-Reset")).toBe(true);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it("includes rate limit headers when under limit", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(10);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("20");
    });

    it("handles KV failure gracefully for rate limiting (fail open)", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockRejectedValue(new Error("KV unavailable"));
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      expect(response.status).toBe(200);
    });
  });

  describe("Data source handling", () => {
    it("uses KV data source when available", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Data-Source")).toBe("kv");
    });

    it("falls back to chain when KV pause data is missing", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(null); // cache miss
      vi.mocked(readPauseState).mockResolvedValue(true);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(5));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });

      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { paused: boolean; totalAgents: number };

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Data-Source")).toBe("chain");
      expect(body.paused).toBe(true);
      expect(body.totalAgents).toBe(5);
    });
  });

  describe("Edge cases", () => {
    it("uses x-real-ip header when x-forwarded-for is not present", async () => {
      const { kv } = await import("@vercel/kv");
      const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
      const { readPauseState } = await import("@/app/lib/chain");
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/protocol-health/route");

      vi.mocked(kv.incr).mockResolvedValue(1);
      vi.mocked(kv.expire).mockResolvedValue(true as never);
      vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
      vi.mocked(getPauseState).mockResolvedValue(false);
      vi.mocked(readPauseState).mockResolvedValue(false);
      vi.mocked(getPulseEvents).mockResolvedValue(mockInsightAgents(42));

      const request = new Request("https://example.com/api/protocol-health", {
        headers: { "x-real-ip": "192.168.1.100" },
      });

      const response = await GET(request as unknown as never);

      expect(response.status).toBe(200);
      expect(kv.incr).toHaveBeenCalledWith("ratelimit:health:192.168.1.100");
    });
  });
});
