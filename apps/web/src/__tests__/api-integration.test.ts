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

vi.mock("@/app/lib/insight", () => {
  class InsightError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    InsightError,
    getPulseEvents: vi.fn(),
  };
});

describe("API integration (HTTP-level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/status/{address} returns cached response with headers", async () => {
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

    const body = (await response.json()) as {
      address: string;
      isAlive: boolean;
      lastPulse: number;
      streak: number;
      hazardScore: number;
      ttlSeconds: number;
      source: string;
    };

    expect(response.status).toBe(200);
    expect(body.address).toBe(address.toLowerCase());
    expect(body.isAlive).toBe(true);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Cache-Status")).toBe("HIT");
  });

  it("GET /api/protocol-health returns degraded status when RPC unhealthy", async () => {
    const { kv } = await import("@vercel/kv");
    const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
    const { readPauseState } = await import("@/app/lib/chain");
    const { getPulseEvents } = await import("@/app/lib/insight");
    const { GET } = await import("../app/api/protocol-health/route");

    vi.mocked(kv.incr).mockResolvedValue(1);
    vi.mocked(kv.expire).mockResolvedValue(true as never);

    vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
    vi.mocked(getPauseState).mockResolvedValue(false);
    vi.mocked(readPauseState).mockResolvedValue(null);
    vi.mocked(getPulseEvents).mockResolvedValue({ data: [], meta: { totalEvents: 0, page: 1, limit: 100, totalPages: 1, hasNextPage: false } });

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
    expect(body.kvHealthy).toBe(true);
    expect(body.rpcHealthy).toBe(false);
    expect(body.status).toBe("degraded");
  });

  it("GET /api/protocol-health returns healthy status when RPC + KV healthy", async () => {
    const { kv } = await import("@vercel/kv");
    const { checkKVHealth, getPauseState } = await import("@/app/lib/kv");
    const { readPauseState } = await import("@/app/lib/chain");
    const { getPulseEvents } = await import("@/app/lib/insight");
    const { GET } = await import("../app/api/protocol-health/route");

    vi.mocked(kv.incr).mockResolvedValue(1);
    vi.mocked(kv.expire).mockResolvedValue(true as never);

    vi.mocked(checkKVHealth).mockResolvedValue({ healthy: true, latencyMs: 5 });
    vi.mocked(getPauseState).mockResolvedValue(true);
    vi.mocked(readPauseState).mockResolvedValue(true);
    vi.mocked(getPulseEvents).mockResolvedValue({ data: [], meta: { totalEvents: 0, page: 1, limit: 100, totalPages: 1, hasNextPage: false } });

    const request = new Request("https://example.com/api/protocol-health", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    });

    const response = await GET(request as unknown as never);
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
  });

  it("POST /api/pulse-webhook validates webhook and updates KV", async () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
    process.env.NEXT_PUBLIC_PULSE_REGISTRY_SEPOLIA = "0x2222222222222222222222222222222222222222";

    const { setAgentState } = await import("@/app/lib/kv");
    const { POST } = await import("../app/api/pulse-webhook/route");

    vi.mocked(setAgentState).mockResolvedValue(undefined);

    const payload = {
      type: "event",
      chainId: 84532,
      contractAddress: "0x2222222222222222222222222222222222222222",
      signature: "Pulse(address,uint256,uint256,uint256)",
      eventName: "Pulse",
      data: {
        agent: "0x1111111111111111111111111111111111111111",
        amount: "100",
        timestamp: "1710000000",
        streak: "3",
      },
      transaction: {
        hash: "0xabc",
        blockNumber: 123,
        blockHash: "0xdef",
        timestamp: 1710000000,
        from: "0x0000000000000000000000000000000000000000",
        to: "0x0000000000000000000000000000000000000000",
      },
      log: {
        address: "0x2222222222222222222222222222222222222222",
        topics: [],
        data: "0x",
        logIndex: 0,
      },
      webhook: {
        id: "wh_1",
        timestamp: new Date().toISOString(),
      },
    };

    const request = new Request("https://example.com/api/pulse-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const response = await POST(request as unknown as never);
    const body = (await response.json()) as { success?: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(setAgentState).toHaveBeenCalledWith(
      payload.data.agent.toLowerCase(),
      expect.objectContaining({
        isAlive: true,
        lastPulse: Number(payload.data.timestamp),
        streak: Number(payload.data.streak),
      })
    );
  });

  it("GET /api/pulse-feed supports pagination and sort order", async () => {
    const { getPulseEvents } = await import("@/app/lib/insight");
    const { GET } = await import("../app/api/pulse-feed/route");

    vi.mocked(getPulseEvents).mockResolvedValue({
      data: [
        {
          agent: "0x1111111111111111111111111111111111111111",
          amount: 10n,
          timestamp: 1710000000,
          streak: 1,
          blockNumber: 100,
          logIndex: 0,
          transactionHash: "0xaaa",
        },
        {
          agent: "0x2222222222222222222222222222222222222222",
          amount: 20n,
          timestamp: 1710000100,
          streak: 2,
          blockNumber: 101,
          logIndex: 1,
          transactionHash: "0xbbb",
        },
      ],
      meta: {
        totalEvents: 2,
        page: 1,
        limit: 2,
        totalPages: 3,
        hasNextPage: true,
      },
    });

    const request = new Request(
      "https://example.com/api/pulse-feed?limit=2&page=1&sort=asc"
    );

    const response = await GET(request as unknown as never);
    const body = (await response.json()) as {
      data: Array<{ agent: string; timestampFormatted: string }>;
      pagination: { page: number; limit: number };
    };

    expect(response.status).toBe(200);
    expect(getPulseEvents).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: "asc", limit: 2, page: 1 })
    );
    expect(body.data).toHaveLength(2);
    expect(body.data[0].timestampFormatted).toContain("T");
    expect(body.pagination.page).toBe(1);
  });
});
