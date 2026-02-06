// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock state
const mockKvState = new Map<string, unknown>();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (key: string) => mockKvState.get(key)),
    set: vi.fn(async (key: string, value: unknown, opts?: { ex?: number }) => {
      mockKvState.set(key, value);
    }),
    del: vi.fn(async (key: string) => mockKvState.delete(key)),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => true),
    pipeline: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock("@/app/lib/chain", () => ({
  readMinPulseAmount: vi.fn().mockResolvedValue(1000n), // 0.001 ETH/USDC
}));

vi.mock("thirdweb/x402", () => ({
  facilitator: vi.fn(() => ({})),
  settlePayment: vi.fn(),
}));

vi.mock("thirdweb", () => ({
  createThirdwebClient: vi.fn(() => ({})),
}));

describe("GET /api/v2/network/global-stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKvState.clear();
    process.env.THIRDWEB_SECRET_KEY = "test-secret-key";
    process.env.SERVER_WALLET_ADDRESS = "0x" + "a".repeat(40);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createRequest = (opts?: { paymentHeader?: string; headers?: Record<string, string> }): NextRequest => {
    const headers: Record<string, string> = opts?.headers || {};
    if (opts?.paymentHeader) {
      headers["x-payment"] = opts.paymentHeader;
    }
    return new NextRequest("https://example.com/api/v2/network/global-stats", { headers });
  };

  it("should return generated network stats when cache is empty", async () => {
    const { GET } = await import("../network/global-stats/route");
    const { settlePayment } = await import("thirdweb/x402");
    
    // Paid request
    vi.mocked(settlePayment).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0x123", amount: "100" },
    });

    const request = createRequest({ paymentHeader: "valid-payment" });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalAgents).toBeGreaterThan(0);
    expect(body.networkBurnRate).toBeDefined();
    expect(body._payment).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it("should cache generated stats", async () => {
    const { GET } = await import("../network/global-stats/route");
    const { settlePayment } = await import("thirdweb/x402");
    const { kv } = await import("@vercel/kv");
    
    vi.mocked(settlePayment).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0x123", amount: "100" },
    });

    const request = createRequest({ paymentHeader: "valid-payment" });
    await GET(request);

    expect(kv.set).toHaveBeenCalledWith(
      "v2:network:global-stats",
      expect.objectContaining({
        totalAgents: expect.any(Number),
      }),
      expect.any(Object)
    );
  });

  it("should return cached stats for free tier if available", async () => {
    const { GET } = await import("../network/global-stats/route");
    const cachedStats = {
      totalActiveAgents: 100,
      totalAgents: 200,
      averageStreak: 50,
      networkBurnRate: 1.5,
      networkMetrics: {
        totalPulses24h: 1000,
        newAgents24h: 5,
        expiredAgents24h: 2
      },
      timestamp: 1234567890
    };
    
    mockKvState.set("v2:network:global-stats", cachedStats);

    const request = createRequest(); // No payment
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalActiveAgents).toBe(100);
    expect(body._tier).toBe("free");
    expect(body._cached).toBe(true);
  });

  it("should calculate burn rate based on pulse amount", async () => {
    const { GET } = await import("../network/global-stats/route");
    const { settlePayment } = await import("thirdweb/x402");
    
    vi.mocked(settlePayment).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0x123", amount: "100" },
    });

    const request = createRequest({ paymentHeader: "valid-payment" });
    const response = await GET(request);
    const body = await response.json();

    // With 1000n (0.001) minPulseAmount and multiplier 3 in code:
    // pulseCost = 0.001
    // costPerPulse = 0.003
    // burnRate = pulses * 0.003
    // We can't predict exact pulses due to randomness, but we check it's calculated
    expect(body.networkBurnRate).toBeGreaterThan(0);
  });
});
