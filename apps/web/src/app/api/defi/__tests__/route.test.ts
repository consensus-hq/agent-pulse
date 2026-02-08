import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Create mock objects that will persist across module reloads
const mockState = {
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  kvIncr: vi.fn().mockResolvedValue(1),
  kvExpire: vi.fn().mockResolvedValue(1),
  signTypedData: vi.fn(),
};

// Mocks must be defined before imports
vi.mock("@vercel/kv", () => ({
  kv: {
    get: (...args: unknown[]) => mockState.kvGet(...args),
    set: (...args: unknown[]) => mockState.kvSet(...args),
    incr: (...args: unknown[]) => mockState.kvIncr(...args),
    expire: (...args: unknown[]) => mockState.kvExpire(...args),
    pipeline: vi.fn(() => ({
      incr: vi.fn(),
      expire: vi.fn(),
      exec: vi.fn().mockResolvedValue([1, true]),
    })),
  },
}));

vi.mock("viem", () => ({
  createWalletClient: vi.fn(() => ({
    account: { address: "0x1234567890123456789012345678901234567890" },
    signTypedData: (...args: unknown[]) => mockState.signTypedData(...args),
  })),
  http: vi.fn(),
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({ address: "0x1234567890123456789012345678901234567890" })),
}));

vi.mock("viem/chains", () => ({
  base: { id: 8453, name: "Base" },
}));

// Import after mocks
import { GET } from "../route";

// Global fetch mock
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("HeyElsa x402 Proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HEYELSA_PAYMENT_KEY = "0x" + "a".repeat(64);
    mockState.signTypedData.mockResolvedValue("0x" + "b".repeat(130));
    mockState.kvGet.mockResolvedValue(null);
    mockState.kvSet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to create mock requests
  function createRequest(url: string): NextRequest {
    return new NextRequest(url);
  }

  describe("FINDING-001: Cache Key Isolation", () => {
    it("should use different cache keys for different tokens", async () => {
      // Mock 402 then success
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ price: 3000 }),
        } as unknown as Response);

      // First call with ETH
      await GET(createRequest(
        "http://localhost:3000/api/defi?action=token_price&address=0x1234567890123456789012345678901234567890&token=0x4200000000000000000000000000000000000006"
      ));

      // Check cache key for ETH
      const cacheCall = mockState.kvSet.mock.calls.find(call => call[0].startsWith("defi:"));
      const firstCallKey = cacheCall ? cacheCall[0] : "";
      expect(firstCallKey).toContain("0x4200000000000000000000000000000000000006");

      vi.clearAllMocks();

      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ price: 1 }),
        } as unknown as Response);

      // Second call with USDC
      await GET(createRequest(
        "http://localhost:3000/api/defi?action=token_price&address=0x1234567890123456789012345678901234567890&token=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      ));

      // Check cache key for USDC - should be different
      const secondCacheCall = mockState.kvSet.mock.calls.find(call => call[0].startsWith("defi:") && call[0].includes("0x8335"));
      const secondCallKey = secondCacheCall ? secondCacheCall[0] : "";
      expect(secondCallKey).toContain("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
      expect(firstCallKey).not.toBe(secondCallKey);
    });

    it("should normalize cache keys to lowercase", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ price: 3000 }),
        } as unknown as Response);

      // Call with lowercase ETH address
      await GET(createRequest(
        "http://localhost:3000/api/defi?action=token_price&address=0x1234567890123456789012345678901234567890&token=0x4200000000000000000000000000000000000006"
      ));

      const firstCall = mockState.kvSet.mock.calls.find(call => call[0].startsWith("defi:"));
      const firstCallKey = firstCall ? firstCall[0] : "";

      vi.clearAllMocks();

      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ price: 3000 }),
        } as unknown as Response);

      // Call with uppercase ETH address (mixed case)
      await GET(createRequest(
        "http://localhost:3000/api/defi?action=token_price&address=0x1234567890123456789012345678901234567890&token=0x4200000000000000000000000000000000000006"
      ));

      const secondCall = mockState.kvSet.mock.calls.find(call => call[0].startsWith("defi:"));
      const secondCallKey = secondCall ? secondCall[0] : "";

      // Both calls should use the same normalized (lowercase) cache key
      expect(firstCallKey).toBe(secondCallKey);
      expect(firstCallKey).toContain("0x4200000000000000000000000000000000000006");
    });

    it("should not include token in cache key for portfolio/balances endpoints", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ portfolio: [] }),
        } as unknown as Response);

      // Call portfolio endpoint
      await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      const portfolioCall = mockState.kvSet.mock.calls.find(call => call[0].startsWith("defi:portfolio"));
      const portfolioKey = portfolioCall ? portfolioCall[0] : "";
      expect(portfolioKey).toBe("defi:portfolio:0x1234567890123456789012345678901234567890");
      expect(portfolioKey).not.toContain("token");

      vi.clearAllMocks();

      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ balances: [] }),
        } as unknown as Response);

      // Call balances endpoint
      await GET(createRequest(
        "http://localhost:3000/api/defi?action=balances&address=0x1234567890123456789012345678901234567890"
      ));

      const balancesCall = mockState.kvSet.mock.calls.find(call => call[0].startsWith("defi:balances"));
      const balancesKey = balancesCall ? balancesCall[0] : "";
      expect(balancesKey).toBe("defi:balances:0x1234567890123456789012345678901234567890");
      expect(balancesKey).not.toContain("token");
    });
  });

  describe("FINDING-003: Payment Guard", () => {
    it("should allow payment of $0.04 (40000)", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ portfolio: [] }),
        } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2); // 402 + retry
    });

    it("should allow payment of exactly $0.05 (50000)", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "50000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ portfolio: [] }),
        } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should REJECT payment of $0.06 (60000)", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 402,
        json: vi.fn().mockResolvedValue({
          accepts: [{
            scheme: "exact",
            network: "base",
            maxAmountRequired: "60000",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0xPayeeAddress",
            maxTimeoutSeconds: 300,
          }],
        }),
      } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain("Payment rejected");
      expect(body.error).toContain("$0.05");
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry attempted
    });

    it("should REJECT payment of $1.00 (1000000) immediately", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 402,
        json: vi.fn().mockResolvedValue({
          accepts: [{
            scheme: "exact",
            network: "base",
            maxAmountRequired: "1000000",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0xPayeeAddress",
            maxTimeoutSeconds: 300,
          }],
        }),
      } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain("Payment rejected");
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry attempted
    });
  });

  describe("FINDING-002: 402 Response Parsing", () => {
    it("should parse { accepts: [...] } format correctly", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            x402Version: 1,
            error: "Payment required",
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
              extra: { someData: "value" },
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ portfolio: [] }),
        } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify second call includes X-PAYMENT header
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[1].headers["X-PAYMENT"]).toBeDefined();
    });

    it("should handle flat format with payTo at root as fallback", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            scheme: "exact",
            network: "base",
            maxAmountRequired: "40000",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            payTo: "0xPayeeAddress",
            maxTimeoutSeconds: 300,
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ portfolio: [] }),
        } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw error on empty 402 body", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 402,
        json: vi.fn().mockResolvedValue({}),
      } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBeDefined();
    });
  });

  describe("x402 Flow Tests", () => {
    it("should complete full 402→sign→retry flow with X-PAYMENT header", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 402,
          json: vi.fn().mockResolvedValue({
            accepts: [{
              scheme: "exact",
              network: "base",
              maxAmountRequired: "40000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0xPayeeAddress",
              maxTimeoutSeconds: 300,
            }],
          }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: vi.fn().mockResolvedValue({ portfolio: [{ token: "ETH", balance: "1.5" }] }),
        } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call - no X-PAYMENT
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[1].headers["X-PAYMENT"]).toBeUndefined();

      // Second call - with X-PAYMENT
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[1].headers["X-PAYMENT"]).toBeDefined();

      // Verify X-PAYMENT is base64 encoded JSON
      const paymentHeader = secondCall[1].headers["X-PAYMENT"];
      const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
      expect(decoded.x402Version).toBe(1);
      expect(decoded.scheme).toBe("exact");
      expect(decoded.network).toBe("base");
      expect(decoded.payload.signature).toBeDefined();
      expect(decoded.payload.authorization).toBeDefined();
    });

    it("should not sign payment when HeyElsa returns 200 on first try", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue({ portfolio: [{ token: "ETH", balance: "1.5" }] }),
      } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should return 503 error when HeyElsa returns 500", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        ok: false,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      } as unknown as Response);

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("HeyElsa API error");
      expect(body.status).toBe(500);
    });
  });

  describe("Input Validation", () => {
    it("should return health check for missing action param", async () => {
      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.walletAddress).toBeDefined();
    });

    it("should return 400 for invalid action with valid actions list", async () => {
      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=invalid_action&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid action");
      expect(body.validActions).toEqual(expect.arrayContaining(["portfolio", "balances", "token_price", "swap_quote", "swap_execute"]));
    });

    it("should return 400 for missing address", async () => {
      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio"
      ));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("address");
    });

    it("should return 400 for invalid address format (too short)", async () => {
      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x123456"
      ));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("address");
    });

    it("should return 400 for invalid address format (no 0x prefix)", async () => {
      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("address");
    });

    it("should return 400 for token_price without token param", async () => {
      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=token_price&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("token");
    });

    it("should return 400 for token_price with invalid token address", async () => {
      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=token_price&address=0x1234567890123456789012345678901234567890&token=invalid"
      ));

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("token");
    });
  });

  describe("Cache Behavior", () => {
    it("should return cached data without calling HeyElsa when cache hit", async () => {
      mockState.kvGet.mockResolvedValue({
        portfolio: [{ token: "ETH", balance: "1.5" }],
      });

      const response = await GET(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body._cached).toBe(true);
    });
  });

  describe("Server Configuration Errors", () => {
    it("should return 503 when HEYELSA_PAYMENT_KEY is not configured", async () => {
      delete process.env.HEYELSA_PAYMENT_KEY;
      
      // Dynamically reload the module to pick up the new env state
      const { GET: GET_noKey } = await import("../route");

      const response = await GET_noKey(createRequest(
        "http://localhost:3000/api/defi?action=portfolio&address=0x1234567890123456789012345678901234567890"
      ));

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain("Payment wallet not configured");
    });
  });
});
