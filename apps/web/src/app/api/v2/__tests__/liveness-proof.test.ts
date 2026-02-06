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

// Mock jose for JWT signing with proper verification
const mockSignJWT = vi.fn().mockResolvedValue("mock-jwt-proof-token");
vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation((payload) => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setAudience: vi.fn().mockReturnThis(),
    setIssuer: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue(`jwt-${JSON.stringify(payload)}`),
  })),
}));

describe("GET /api/v2/agent/[address]/liveness-proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKvState.clear();
    mockRateLimits.clear();
    process.env.THIRDWEB_SECRET_KEY = "test-secret-key";
    process.env.SERVER_WALLET_ADDRESS = "0x" + "a".repeat(40);
    process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID = "test-client-id";
    process.env.LIVENESS_JWT_SECRET = "agent-pulse-liveness-secret-key-min-32-chars-long";
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createRequest = (address: string, opts?: { paymentHeader?: string; headers?: Record<string, string> }): NextRequest => {
    const headers: Record<string, string> = opts?.headers || {};
    if (opts?.paymentHeader) {
      headers["x-payment"] = opts.paymentHeader;
    }
    return new NextRequest(`https://example.com/api/v2/agent/${address}/liveness-proof`, {
      headers,
    });
  };

  const validAddress = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04";
  const normalizedAddress = validAddress.toLowerCase();

  describe("JWT proof generation", () => {
    it("should generate a signed JWT proof token for live agent", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 30), 10n, 5n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.proofToken).toBeDefined();
      expect(typeof body.proofToken).toBe("string");
      expect(body.proofToken).toContain("jwt-");
    });

    it("should include agent address in JWT payload", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 30), 10n, 5n]);

      const { SignJWT } = await import("jose");
      const { GET } = await import("../agent/[address]/liveness-proof/route");

      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
      await GET(request, { params: Promise.resolve({ address: validAddress }) });

      expect(SignJWT).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: normalizedAddress,
          scope: "liveness-proof",
        })
      );
    });

    it("should include isAlive status in JWT payload", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([false, BigInt(now - 300), 0n, 50n]);

      const { SignJWT } = await import("jose");
      const { GET } = await import("../agent/[address]/liveness-proof/route");

      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
      await GET(request, { params: Promise.resolve({ address: validAddress }) });

      expect(SignJWT).toHaveBeenCalledWith(
        expect.objectContaining({
          isAlive: false,
        })
      );
    });

    it("should include staleness in JWT payload", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 120), 5n, 10n]);

      const { SignJWT } = await import("jose");
      const { GET } = await import("../agent/[address]/liveness-proof/route");

      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
      await GET(request, { params: Promise.resolve({ address: validAddress }) });

      expect(SignJWT).toHaveBeenCalledWith(
        expect.objectContaining({
          staleness: expect.any(Number),
        })
      );
    });
  });

  describe("Staleness calculation", () => {
    it("should calculate staleness as seconds since last pulse", async () => {
      const now = Math.floor(Date.now() / 1000);
      const lastPulse = now - 60; // 60 seconds ago
      mockReadContract.mockResolvedValueOnce([true, BigInt(lastPulse), 5n, 10n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.staleness).toBeGreaterThanOrEqual(60);
      expect(body.staleness).toBeLessThan(65); // Allow some variance
    });

    it("should return staleness of 0 for agent that just pulsed", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now), 5n, 10n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(body.staleness).toBeGreaterThanOrEqual(0);
      expect(body.staleness).toBeLessThan(5); // Should be very small
    });

    it("should return Infinity staleness for non-existent agent", async () => {
      mockReadContract.mockResolvedValueOnce(null);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(body.staleness).toBe(Infinity);
      expect(body.isAlive).toBe(false);
    });
  });

  describe("Payment verification", () => {
    it("should return 402 when no payment header provided", async () => {
      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress);

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(402);
      expect(body.error).toBe("Payment Required");
      expect(body.accepts[0].maxAmountRequired).toBe("$0.005");
    });

    it("should verify payment through x402 settlement", async () => {
      const { settlePayment } = await import("thirdweb/x402");
      vi.mocked(settlePayment).mockResolvedValueOnce({
        status: 200,
        paymentReceipt: {
          payer: "0x" + "b".repeat(40),
          amount: "5000",
        },
      });

      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 30), 10n, 5n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(settlePayment).toHaveBeenCalled();
      expect(body._payment).toBeDefined();
    });

    it("should reject invalid payment", async () => {
      const { settlePayment } = await import("thirdweb/x402");
      vi.mocked(settlePayment).mockRejectedValueOnce(new Error("Invalid payment"));

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "invalid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });

      expect(response.status).toBe(500);
    });
  });

  describe("Caching behavior", () => {
    it("should cache liveness data with short TTL (30s)", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 30), 10n, 5n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const { kv } = await import("@vercel/kv");

      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
      await GET(request, { params: Promise.resolve({ address: validAddress }) });

      expect(kv.set).toHaveBeenCalledWith(
        expect.stringContaining("v2:liveness:"),
        expect.any(Object),
        { ex: 30 }
      );
    });

    it("should return cached data on free tier cache hit", async () => {
      const cachedData = {
        agent: normalizedAddress,
        isAlive: true,
        lastPulse: 1710000000,
        staleness: 30,
        proofToken: "cached-jwt-token",
        verifiedAt: new Date().toISOString(),
      };
      mockKvState.set(`v2:liveness:${normalizedAddress}`, cachedData);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress);

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body._cached).toBe(true);
      expect(body.proofToken).toBe("cached-jwt-token");
    });

    it("should return cached proof token on cache hit", async () => {
      const cachedData = {
        agent: normalizedAddress,
        isAlive: true,
        lastPulse: 1710000000,
        staleness: 30,
        proofToken: "old-jwt-token",
        verifiedAt: new Date().toISOString(),
      };
      mockKvState.set(`v2:liveness:${normalizedAddress}`, cachedData);

      const { SignJWT } = await import("jose");
      const { GET } = await import("../agent/[address]/liveness-proof/route");

      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      // Should return the cached token
      expect(body.proofToken).toBe("old-jwt-token");
      // Should NOT generate a new token
      expect(SignJWT).not.toHaveBeenCalled();
    });
  });

  describe("Response schema", () => {
    it("should return all expected fields", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 60), 5n, 10n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(body).toHaveProperty("agent");
      expect(body).toHaveProperty("isAlive");
      expect(body).toHaveProperty("lastPulse");
      expect(body).toHaveProperty("staleness");
      expect(body).toHaveProperty("proofToken");
      expect(body).toHaveProperty("verifiedAt");
      expect(body).toHaveProperty("_tier");
    });

    it("should return correct data types", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 60), 5n, 10n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(typeof body.agent).toBe("string");
      expect(typeof body.isAlive).toBe("boolean");
      expect(typeof body.lastPulse).toBe("number");
      expect(typeof body.staleness).toBe("number");
      expect(typeof body.proofToken).toBe("string");
      expect(typeof body.verifiedAt).toBe("string");
    });
  });

  describe("Edge cases", () => {
    it("should handle agent with zero lastPulse", async () => {
      mockReadContract.mockResolvedValueOnce([false, 0n, 0n, 0n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.isAlive).toBe(false);
      expect(body.lastPulse).toBe(0);
    });

    it("should handle chain read errors gracefully", async () => {
      mockReadContract.mockRejectedValueOnce(new Error("RPC error"));

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(response.status).toBe(200); // Should still return with defaults
      expect(body.isAlive).toBe(false);
    });

    it("should include verifiedAt timestamp in ISO format", async () => {
      const now = Math.floor(Date.now() / 1000);
      mockReadContract.mockResolvedValueOnce([true, BigInt(now - 30), 5n, 10n]);

      const { GET } = await import("../agent/[address]/liveness-proof/route");
      const request = createRequest(validAddress, { paymentHeader: "valid-payment" });

      const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
      const body = await response.json();

      expect(body.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
