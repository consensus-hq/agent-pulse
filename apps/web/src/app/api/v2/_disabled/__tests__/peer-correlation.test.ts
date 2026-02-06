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

// Mock chain utils
const mockAgentStatus = {
  lastPulseAt: 1710000000n,
  streak: 50n,
  alive: true,
};
vi.mock("@/app/lib/chain", () => ({
  readAgentStatus: vi.fn().mockResolvedValue(mockAgentStatus),
}));

vi.mock("thirdweb/x402", () => ({
  facilitator: vi.fn(() => ({})),
  settlePayment: vi.fn(),
}));

vi.mock("thirdweb", () => ({
  createThirdwebClient: vi.fn(() => ({})),
}));

describe("GET /api/v2/network/peer-correlation/[address]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKvState.clear();
    process.env.THIRDWEB_SECRET_KEY = "test-secret-key";
    process.env.SERVER_WALLET_ADDRESS = "0x" + "a".repeat(40);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createRequest = (address: string, opts?: { paymentHeader?: string; headers?: Record<string, string> }): NextRequest => {
    const headers: Record<string, string> = opts?.headers || {};
    if (opts?.paymentHeader) {
      headers["x-payment"] = opts.paymentHeader;
    }
    return new NextRequest(`https://example.com/api/v2/network/peer-correlation/${address}`, { headers });
  };

  const validAddress = "0x9508752Ba171D37EBb3AA437927458E0a21D1e04";

  it("should return similar agents for valid address", async () => {
    const { GET } = await import("../network/peer-correlation/[address]/route");
    const { settlePayment } = await import("thirdweb/x402");
    
    vi.mocked(settlePayment).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0x123", amount: "100" },
    });

    const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
    const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.address).toBe(validAddress.toLowerCase());
    expect(body.similarAgents).toHaveLength(5); // Deterministic generator produces 5 peers
    expect(body.correlationCoefficient).toBeDefined();
    expect(body.networkScore).toBeDefined();
  });

  it("should return 404 if agent not found", async () => {
    const { GET } = await import("../network/peer-correlation/[address]/route");
    const { settlePayment } = await import("thirdweb/x402");
    const { readAgentStatus } = await import("@/app/lib/chain");
    
    vi.mocked(settlePayment).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0x123", amount: "100" },
    });
    vi.mocked(readAgentStatus).mockResolvedValueOnce(null);

    const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
    const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
    
    expect(response.status).toBe(404);
  });

  it("should cache correlation results", async () => {
    const { GET } = await import("../network/peer-correlation/[address]/route");
    const { settlePayment } = await import("thirdweb/x402");
    const { kv } = await import("@vercel/kv");
    
    vi.mocked(settlePayment).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0x123", amount: "100" },
    });

    const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
    await GET(request, { params: Promise.resolve({ address: validAddress }) });

    expect(kv.set).toHaveBeenCalledWith(
      `v2:peer-correlation:${validAddress.toLowerCase()}`,
      expect.objectContaining({
        address: validAddress.toLowerCase(),
        similarAgents: expect.any(Array),
      }),
      expect.any(Object)
    );
  });

  it("should return cached results for free tier", async () => {
    const { GET } = await import("../network/peer-correlation/[address]/route");
    const cachedData = {
      address: validAddress.toLowerCase(),
      correlationCoefficient: 0.8,
      similarAgents: [],
      peerCount: 0,
      networkScore: 50
    };
    mockKvState.set(`v2:peer-correlation:${validAddress.toLowerCase()}`, cachedData);

    const request = createRequest(validAddress); // No payment
    const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body._cached).toBe(true);
    expect(body._tier).toBe("free");
    expect(body.correlationCoefficient).toBe(0.8);
  });

  it("should sort similar agents by correlation score", async () => {
    const { GET } = await import("../network/peer-correlation/[address]/route");
    const { settlePayment } = await import("thirdweb/x402");
    
    vi.mocked(settlePayment).mockResolvedValue({
      status: 200,
      paymentReceipt: { payer: "0x123", amount: "100" },
    });

    const request = createRequest(validAddress, { paymentHeader: "valid-payment" });
    const response = await GET(request, { params: Promise.resolve({ address: validAddress }) });
    const body = await response.json();

    const similar = body.similarAgents;
    expect(similar.length).toBeGreaterThan(0);
    
    // Check if sorted descending
    for (let i = 0; i < similar.length - 1; i++) {
      expect(similar[i].correlationScore).toBeGreaterThanOrEqual(similar[i + 1].correlationScore);
    }
  });
});
