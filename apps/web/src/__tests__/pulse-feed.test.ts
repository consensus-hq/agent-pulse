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
    statusCode?: number;
    constructor(code: string, message: string, statusCode?: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  return {
    InsightError,
    getPulseEvents: vi.fn(),
  };
});

describe("GET /api/pulse-feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Successful response", () => {
    it("returns expected schema with agents array, data array, pagination and meta", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      const mockPulseEvents = [
        {
          agent: "0x1111111111111111111111111111111111111111",
          amount: 1000000000000000000n,
          timestamp: 1710000000,
          streak: 5,
          totalBurned: 0n,
          blockNumber: 12345,
          logIndex: 0,
          transactionHash: "0xabc123def456",
        },
        {
          agent: "0x2222222222222222222222222222222222222222",
          amount: 2000000000000000000n,
          timestamp: 1710000100,
          streak: 3,
          totalBurned: 0n,
          blockNumber: 12346,
          logIndex: 1,
          transactionHash: "0xdef789abc012",
        },
      ];

      vi.mocked(getPulseEvents).mockResolvedValue({
        data: mockPulseEvents,
        meta: {
          totalEvents: 100,
          page: 0,
          limit: 50,
          totalPages: 2,
          hasNextPage: true,
        },
      });

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        data: Array<{
          agent: string;
          amount: string;
          timestamp: number;
          streak: number;
          blockNumber: number;
          transactionHash: string;
          logIndex: number;
          timestampFormatted: string;
        }>;
        pagination: {
          page: number;
          limit: number;
          totalEvents: number;
          totalPages: number;
          hasNextPage: boolean;
          hasPreviousPage: boolean;
        };
        meta: {
          requestId: string;
          durationMs: number;
          timestamp: number;
        };
      };

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);

      // Check feed item schema
      const item = body.data[0];
      expect(item).toHaveProperty("agent");
      expect(item).toHaveProperty("amount");
      expect(item).toHaveProperty("timestamp");
      expect(item).toHaveProperty("streak");
      expect(item).toHaveProperty("blockNumber");
      expect(item).toHaveProperty("transactionHash");
      expect(item).toHaveProperty("logIndex");
      expect(item).toHaveProperty("timestampFormatted");

      // Check types
      expect(typeof item.agent).toBe("string");
      expect(typeof item.amount).toBe("string");
      expect(typeof item.timestamp).toBe("number");
      expect(typeof item.streak).toBe("number");
      expect(typeof item.blockNumber).toBe("number");
      expect(typeof item.transactionHash).toBe("string");
      expect(typeof item.logIndex).toBe("number");
      expect(typeof item.timestampFormatted).toBe("string");

      // Check pagination schema
      expect(body.pagination).toBeDefined();
      expect(body.pagination).toHaveProperty("page");
      expect(body.pagination).toHaveProperty("limit");
      expect(body.pagination).toHaveProperty("totalEvents");
      expect(body.pagination).toHaveProperty("totalPages");
      expect(body.pagination).toHaveProperty("hasNextPage");
      expect(body.pagination).toHaveProperty("hasPreviousPage");
      expect(body.pagination.page).toBe(0);
      expect(body.pagination.limit).toBe(50);
      expect(body.pagination.totalEvents).toBe(100);
      expect(body.pagination.totalPages).toBe(2);
      expect(body.pagination.hasNextPage).toBe(true);
      expect(body.pagination.hasPreviousPage).toBe(false);

      // Check meta schema
      expect(body.meta).toBeDefined();
      expect(body.meta).toHaveProperty("requestId");
      expect(body.meta).toHaveProperty("durationMs");
      expect(body.meta).toHaveProperty("timestamp");
      expect(typeof body.meta.requestId).toBe("string");
      expect(typeof body.meta.durationMs).toBe("number");
      expect(typeof body.meta.timestamp).toBe("number");
    });
  });

  describe("Cache headers", () => {
    it("returns proper Cache-Control headers for edge caching", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockResolvedValue({
        data: [],
        meta: {
          totalEvents: 0,
          page: 0,
          limit: 50,
          totalPages: 0,
          hasNextPage: false,
        },
      });

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("public, max-age=10, stale-while-revalidate=30");
      expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("max-age=10");
      expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=10");
    });
  });

  describe("Empty feed", () => {
    it("returns valid structure when no pulses exist yet", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockResolvedValue({
        data: [],
        meta: {
          totalEvents: 0,
          page: 0,
          limit: 50,
          totalPages: 0,
          hasNextPage: false,
        },
      });

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        data: unknown[];
        pagination: {
          page: number;
          limit: number;
          totalEvents: number;
          totalPages: number;
          hasNextPage: boolean;
          hasPreviousPage: boolean;
        };
        meta: {
          requestId: string;
          durationMs: number;
          timestamp: number;
        };
      };

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.pagination.totalEvents).toBe(0);
      expect(body.pagination.totalPages).toBe(0);
      expect(body.pagination.hasNextPage).toBe(false);
      expect(body.pagination.hasPreviousPage).toBe(false);
    });
  });

  describe("Query parameter validation", () => {
    it("returns 400 for invalid agent address format", async () => {
      const { GET } = await import("../app/api/pulse-feed/route");

      const request = new Request("https://example.com/api/pulse-feed?agent=invalid-address");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { error: string; requestId: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid agent address format");
      expect(body.requestId).toBeDefined();
    });

    it("returns 400 for invalid limit parameter", async () => {
      const { GET } = await import("../app/api/pulse-feed/route");

      const request = new Request("https://example.com/api/pulse-feed?limit=200");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { error: string; requestId: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain("Limit must be between 1 and 100");
    });

    it("returns 400 for invalid page parameter", async () => {
      const { GET } = await import("../app/api/pulse-feed/route");

      const request = new Request("https://example.com/api/pulse-feed?page=-1");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { error: string; requestId: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain("Page must be between 0 and 1000");
    });

    it("returns 400 for invalid sort parameter", async () => {
      const { GET } = await import("../app/api/pulse-feed/route");

      const request = new Request("https://example.com/api/pulse-feed?sort=invalid");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as { error: string; requestId: string };

      expect(response.status).toBe(400);
      expect(body.error).toContain('Sort must be "asc" or "desc"');
    });

    it("accepts valid agent address with 0x prefix", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockResolvedValue({
        data: [],
        meta: {
          totalEvents: 0,
          page: 0,
          limit: 50,
          totalPages: 0,
          hasNextPage: false,
        },
      });

      const request = new Request("https://example.com/api/pulse-feed?agent=0x1111111111111111111111111111111111111111");
      const response = await GET(request as unknown as never);

      expect(response.status).toBe(200);
      expect(getPulseEvents).toHaveBeenCalledWith(
        expect.objectContaining({ agent: "0x1111111111111111111111111111111111111111" })
      );
    });

    it("passes correct parameters to getPulseEvents", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockResolvedValue({
        data: [],
        meta: {
          totalEvents: 0,
          page: 1,
          limit: 25,
          totalPages: 0,
          hasNextPage: false,
        },
      });

      const request = new Request("https://example.com/api/pulse-feed?limit=25&page=1&sort=asc");
      const response = await GET(request as unknown as never);

      expect(response.status).toBe(200);
      expect(getPulseEvents).toHaveBeenCalledWith({
        agent: undefined,
        limit: 25,
        page: 1,
        sortOrder: "asc",
      });
    });
  });

  describe("Insight API errors", () => {
    it("returns 500 when missing client ID configuration", async () => {
      const { getPulseEvents, InsightError } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockRejectedValue(
        new InsightError("MISSING_CLIENT_ID", "NEXT_PUBLIC_THIRDWEB_CLIENT_ID environment variable not set")
      );

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        error: string;
        message: string;
        requestId: string;
        durationMs: number;
      };

      expect(response.status).toBe(500);
      expect(body.error).toBe("Server configuration error");
      expect(body.message).toBe("Thirdweb client ID not configured");
      expect(body.requestId).toBeDefined();
      expect(body.durationMs).toBeDefined();
    });

    it("returns 502 for upstream API errors", async () => {
      const { getPulseEvents, InsightError } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockRejectedValue(
        new InsightError("API_ERROR", "Insight API request failed: 500 Internal Server Error")
      );

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        error: string;
        message: string;
        requestId: string;
        durationMs: number;
      };

      expect(response.status).toBe(502);
      expect(body.error).toBe("Upstream API error");
      expect(body.message).toContain("Insight API request failed");
      expect(body.requestId).toBeDefined();
      expect(body.durationMs).toBeDefined();
    });

    it("returns 500 for generic errors", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockRejectedValue(new Error("Network timeout"));

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        error: string;
        message: string;
        requestId: string;
        durationMs: number;
      };

      expect(response.status).toBe(500);
      expect(body.error).toBe("Internal server error");
      expect(body.message).toBe("Network timeout");
      expect(body.requestId).toBeDefined();
      expect(body.durationMs).toBeDefined();
    });
  });

  describe("Feed data transformation", () => {
    it("correctly formats timestamp to ISO string", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      const timestamp = 1710000000;
      vi.mocked(getPulseEvents).mockResolvedValue({
        data: [
          {
            agent: "0x1111111111111111111111111111111111111111",
            amount: 1000000000000000000n,
            timestamp: timestamp,
            streak: 5,
            totalBurned: 0n,
            blockNumber: 12345,
            logIndex: 0,
            transactionHash: "0xabc",
          },
        ],
        meta: {
          totalEvents: 1,
          page: 0,
          limit: 50,
          totalPages: 1,
          hasNextPage: false,
        },
      });

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        data: Array<{ timestampFormatted: string }>;
      };

      expect(body.data[0].timestampFormatted).toBe(new Date(timestamp * 1000).toISOString());
    });

    it("converts bigint amount to string", async () => {
      const { getPulseEvents } = await import("@/app/lib/insight");
      const { GET } = await import("../app/api/pulse-feed/route");

      vi.mocked(getPulseEvents).mockResolvedValue({
        data: [
          {
            agent: "0x1111111111111111111111111111111111111111",
            amount: 123456789012345678901234567890n,
            timestamp: 1710000000,
            streak: 5,
            totalBurned: 0n,
            blockNumber: 12345,
            logIndex: 0,
            transactionHash: "0xabc",
          },
        ],
        meta: {
          totalEvents: 1,
          page: 0,
          limit: 50,
          totalPages: 1,
          hasNextPage: false,
        },
      });

      const request = new Request("https://example.com/api/pulse-feed");
      const response = await GET(request as unknown as never);
      const body = (await response.json()) as {
        data: Array<{ amount: string }>;
      };

      expect(body.data[0].amount).toBe("123456789012345678901234567890");
      expect(typeof body.data[0].amount).toBe("string");
    });
  });
});
