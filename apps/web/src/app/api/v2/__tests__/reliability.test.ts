import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock state for test isolation
const mockKvState = new Map<string, unknown>();
const mockRateLimits = new Map<string, number>();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (key: string) => mockKvState.get(key)),
    set: vi.fn(async (key: string, value: unknown, opts?: { ex?: number }) => {
      mockKvState.set(key, value);
      if (opts?.ex) {
        setTimeout(() => mockKvState.delete(key), opts.ex * 1000);
      }
    }),
    del: vi.fn(async (key: string) => mockKvState.delete(key)),
    incr: vi.fn(async (key: string) => {
      const current = (mockRateLimits.get(key) || 0) + 1;
      mockRateLimits.set(key, current);
      return current;
    }),
    expire: vi.fn(async () => true),
    pipeline: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Mock thirdweb
const mockReadContract = vi.fn();
vi.mock("thirdweb", () => ({
  createThirdwebClient: vi.fn(() => ({})),
  getContract: vi.fn(() => ({})),
  readContract: vi.fn((...args: unknown[]) => mockReadContract(...args)),
}));

vi.mock("thirdweb/chains", () => ({
  baseSepolia: { id: 84532, name: "Base Sepolia" },
}));

vi.mock("thirdweb/x402", () => ({
  facilitator: vi.fn(() => ({})),
  settlePayment: vi.fn(),
}));

// Mock jose for JWT signing
vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setAudience: vi.fn().mockReturnThis(),
    setIssuer: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue("mock-jwt-token"),
  })),
}));

describe("GET /api/v2/agent/[address]/reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKvState.clear();
    mockRateLimits.clear();
    process.env.THIRDWEB_SECRET_KEY = "test-secret-key";
    process.env.SERVER_WALLET_ADDRESS = "0x" + "a".repeat(40);
    process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID = "test-client-id";
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createRequest = (address: string, opts?: { paymentHeader?: string; headers?: Record<string, string> }): NextRequest => {
    const headers: Record<string, string> = opts?.headers || {};
    if (opts?.paymentHeader) {
      headers["x-payment"] = opts.paymentHeader;
    }
    return new NextRequest(`https://example.com/api/v2/agent/${address}/reliability`, {
      headers,
    });
  };

  const validAddress = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04";
  const normalizedAddress = validAddress.toLowerCase();

  describe("Address validation", () => {
    it("should return 400 for invalid address format (missing 0x)", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest("9508752Ba171D37EBb3AA437927458E0a21D1e04");

      const response = await GET(request, { params: Promise.resolve({ address: "9508752Ba171D37EBb3AA437927458E0a21D1e04" }) });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid agent address");
    });

    it("should return 400 for address with wrong length", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest("0x1234");

      const response = await GET(request, { params: Promise.resolve({ address: "0x1234" }) });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid agent address");
    });

    it("should return 400 for address with invalid characters", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest("0x" + "g".repeat(40));

      const response = await GET(request, { params: Promise.resolve({ address: "0x" + "g".repeat(40) }) });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid agent address");
    });

    it("should accept valid Ethereum address (with checksum)", async () => {
      mockReadContract.mockResolvedValueOnce([true, 1710000000n, 5n, 10n]);

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });

      // Should not be 400 - it should proceed to payment check
      expect(response.status).not.toBe(400);
    });

    it("should normalize address to lowercase", async () => {
      mockReadContract.mockResolvedValueOnce([true, 1710000000n, 5n, 10n]);

      const { GET } = await import("../agent/[address]/reliability/route");
      const mixedCaseAddress = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04";
      const request = createRequest(mixedCaseAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: mixedCaseAddress }) });
      const body = await response.json();

      expect(body.agent).toBe(mixedCaseAddress.toLowerCase());
    });
  });

  describe("Cache behavior", () => {
    it("should return 402 when no payment header and cache miss", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress);

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(402);
      expect(body.error).toBe("Payment Required");
      expect(body.x402Version).toBe(1);
      expect(body.accepts).toBeDefined();
      expect(body.accepts[0].maxAmountRequired).toBe("$0.01");
    });

    it("should return cached data on free tier when cache hit", async () => {
      const cachedData = {
        agent: normalizedAddress,
        reliabilityScore: 85,
        uptimePercent: 95.5,
        jitter: 2.5,
        hazardRate: 10,
        lastUpdated: new Date().toISOString(),
      };
      mockKvState.set(`v2:reliability:${normalizedAddress}`, cachedData);

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress);

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body._cached).toBe(true);
      expect(body._tier).toBe("free");
      expect(body.reliabilityScore).toBe(85);
    });

    it("should calculate metrics from chain when paid and cache miss", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 60), 10n, 5n]); // alive, lastPulse 60s ago, streak 10, hazard 5

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body._tier).toBe("paid");
      expect(body.reliabilityScore).toBeDefined();
      expect(body.uptimePercent).toBeDefined();
      expect(body.jitter).toBeDefined();
      expect(body.hazardRate).toBe(5);
    });

    it("should cache result after successful paid request", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 60), 10n, 5n]);

      const { GET } = await import("../agent/[address]/reliability/route");
      const { kv } = await import("@vercel/kv");

      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
      await GET(request, { params: Promise.resolve({ address: validAddress }) });

      expect(kv.set).toHaveBeenCalledWith(
        `v2:reliability:${normalizedAddress}`,
        expect.objectContaining({
          agent: normalizedAddress,
          reliabilityScore: expect.any(Number),
          _tier: "paid",
        }),
        { ex: 300 }
      );
    });
  });

  describe("Rate limiting", () => {
    it("should allow requests under rate limit", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress);

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });

      expect(response.status).toBe(402); // 402 because no payment, but not 429
    });

    it("should return 429 when rate limit exceeded", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");

      // Make 61 requests to exceed the 60/min limit
      const responses = [];
      for (let i = 0; i < 61; i++) {
        const request = createRequest(validAddress, {
          headers: { "x-forwarded-for": "1.2.3.4" },
        });
        responses.push(await GET(request, { params: Promise.resolve({ address: validAddress }) }));
      }

      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
      const body = await lastResponse.json();
      expect(body.error).toContain("Rate limit exceeded");
    });

    it("should track rate limit per IP", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");

      // Make requests from different IPs
      const ip1 = "1.2.3.4";
      const ip2 = "5.6.7.8";

      for (let i = 0; i < 70; i++) {
        const request = createRequest(validAddress, {
          headers: { "x-forwarded-for": i % 2 === 0 ? ip1 : ip2 },
        });
        await GET(request, { params: Promise.resolve({ address: validAddress }) });
      }

      // Both IPs should still be under 60 each (35 each)
      const { kv } = await import("@vercel/kv");
      expect(kv.incr).toHaveBeenCalledTimes(70);
    });
  });

  describe("x402 payment required", () => {
    it("should return correct 402 response with payment requirements", async () => {
      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress);

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(402);
      expect(body.x402Version).toBe(1);
      expect(body.accepts).toHaveLength(1);
      expect(body.accepts[0].scheme).toBe("exact");
      expect(body.accepts[0].network).toBe("eip155:84532");
      expect(body.accepts[0].maxAmountRequired).toBe("$0.01");
      expect(body.accepts[0].asset).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    });

    it("should include payment metadata in response when paid", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 60), 10n, 5n]);

      // We'll mock the settlePayment to return success
      const { settlePayment } = await import("thirdweb/x402");
      vi.mocked(settlePayment).mockResolvedValueOnce({
        status: 200,
        paymentReceipt: {
          payer: "0x" + "b".repeat(40),
          amount: "10000",
        },
      });

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment-data" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      // Response includes payment info if settlement succeeds
      expect(body._payment).toBeDefined();
    });
  });

  describe("Reliability metrics calculation", () => {
    it("should return default low reliability for non-existent agent", async () => {
      mockReadContract.mockResolvedValueOnce(null);

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.reliabilityScore).toBe(0);
      expect(body.uptimePercent).toBe(0);
      expect(body.hazardRate).toBe(0);
    });

    it("should calculate high reliability for active agent with long streak", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 30), 100n, 0n]); // recent pulse, high streak, no hazard

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.reliabilityScore).toBeGreaterThan(80);
      expect(body.uptimePercent).toBeGreaterThan(90);
      expect(body.hazardRate).toBe(0);
    });

    it("should calculate low reliability for agent with high hazard", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 200), 2n, 80n]); // stale pulse, low streak, high hazard

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.reliabilityScore).toBeLessThan(50);
      expect(body.hazardRate).toBe(80);
    });
  });

  describe("Response schema", () => {
    it("should return all expected fields on success", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 60), 5n, 10n]);

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(body).toHaveProperty("agent");
      expect(body).toHaveProperty("reliabilityScore");
      expect(body).toHaveProperty("uptimePercent");
      expect(body).toHaveProperty("jitter");
      expect(body).toHaveProperty("hazardRate");
      expect(body).toHaveProperty("lastUpdated");
      expect(body).toHaveProperty("_tier");
    });

    it("should return proper data types", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 60), 5n, 10n]);

      const { GET } = await import("../agent/[address]/reliability/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(typeof body.agent).toBe("string");
      expect(typeof body.reliabilityScore).toBe("number");
      expect(typeof body.uptimePercent).toBe("number");
      expect(typeof body.jitter).toBe("number");
      expect(typeof body.hazardRate).toBe("number");
      expect(typeof body.lastUpdated).toBe("string");
    });
  });
});
