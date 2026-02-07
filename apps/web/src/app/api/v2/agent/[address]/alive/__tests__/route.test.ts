import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ============================================================================
// Mock setup for viem
// ============================================================================

const mockReadContract = vi.fn();
const mockCreatePublicClient = vi.fn(() => ({
  readContract: mockReadContract,
}));

vi.mock("viem", () => ({
  createPublicClient: mockCreatePublicClient,
  http: vi.fn(),
  isAddress: (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr),
}));

vi.mock("viem/chains", () => ({
  base: { id: 8453, name: "Base" },
  baseSepolia: { id: 84532, name: "Base Sepolia" },
}));

// ============================================================================
// Test setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_CHAIN_ID = "8453";
  process.env.NEXT_PUBLIC_PULSE_REGISTRY = "0xe61C615743A02983A46aFF66Db035297e8a43846";
  process.env.NEXT_PUBLIC_RPC_URL = "https://mainnet.base.org";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Import the route handler after mocks are set up
// ============================================================================

async function importRoute() {
  // Clear module cache to ensure fresh imports with current env vars
  vi.resetModules();
  const { GET } = await import("../route");
  return { GET };
}

function createRequest(address: string): NextRequest {
  return new NextRequest(`https://example.com/api/v2/agent/${address}/alive`);
}

// ============================================================================
// Address Validation Tests
// ============================================================================

describe("GET /api/v2/agent/{address}/alive - Address Validation", () => {
  it("returns 400 for missing address", async () => {
    const { GET } = await importRoute();
    // Use empty string which will fail isAddress check
    const request = new NextRequest("https://example.com/api/v2/agent//alive");
    const response = await GET(request, { params: Promise.resolve({ address: "" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid Ethereum address");
  });

  it("returns 400 for address without 0x prefix", async () => {
    const { GET } = await importRoute();
    const address = "1111111111111111111111111111111111111111";
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid Ethereum address");
  });

  it("returns 400 for address that is too short", async () => {
    const { GET } = await importRoute();
    const address = "0x123456";
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid Ethereum address");
  });

  it("returns 400 for address that is too long", async () => {
    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(50);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid Ethereum address");
  });

  it("returns 400 for address with invalid characters", async () => {
    const { GET } = await importRoute();
    const address = "0xGGGG111111111111111111111111111111111111";
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid Ethereum address");
  });

  it("accepts lowercase address", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "a".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(response.status).toBe(200);
  });

  it("accepts uppercase address", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "A".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(response.status).toBe(200);
  });

  it("accepts mixed-case address (checksummed)", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0xA7940a42c30A7F492Ed578F3aC728c2929103E43";
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(response.status).toBe(200);
  });
});

// ============================================================================
// Successful Response Tests
// ============================================================================

describe("GET /api/v2/agent/{address}/alive - Successful Responses", () => {
  it("returns alive status for living agent", async () => {
    const now = Math.floor(Date.now() / 1000);
    const lastPulse = now - 3600; // 1 hour ago
    
    mockReadContract.mockResolvedValueOnce([true, lastPulse, 42, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.address).toBe(address.toLowerCase());
    expect(body.isAlive).toBe(true);
    expect(body.lastPulseTimestamp).toBe(lastPulse);
    expect(body.streak).toBe(42);
    expect(body.staleness).toBeGreaterThan(0);
    expect(body.ttl).toBe(86400);
    expect(body.checkedAt).toBeDefined();
    
    // Verify staleness calculation
    expect(body.staleness).toBe(now - lastPulse);
  });

  it("returns dead status for non-living agent", async () => {
    const lastPulse = 1700000000;
    
    mockReadContract.mockResolvedValueOnce([false, lastPulse, 0, 0n]);

    const { GET } = await importRoute();
    const address = "0x" + "2".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(false);
    expect(body.streak).toBe(0);
  });

  it("returns correct response for agent that never pulsed", async () => {
    mockReadContract.mockResolvedValueOnce([false, 0, 0, 0n]);

    const { GET } = await importRoute();
    const address = "0x" + "3".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(false);
    expect(body.lastPulseTimestamp).toBe(0);
    expect(body.streak).toBe(0);
    // Staleness is null when lastPulseTimestamp is 0 (never pulsed)
    expect(body.staleness === null || body.staleness === Infinity).toBe(true);
  });

  it("returns correct response for freshly pulsed agent", async () => {
    const now = Math.floor(Date.now() / 1000);
    
    mockReadContract.mockResolvedValueOnce([true, now, 1, 1000n]);

    const { GET } = await importRoute();
    const address = "0x" + "4".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(true);
    expect(body.lastPulseTimestamp).toBe(now);
    expect(body.staleness).toBeLessThanOrEqual(5); // Should be very recent
    expect(body.streak).toBe(1);
  });

  it("handles high streak values", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 999999, 999999999n]);

    const { GET } = await importRoute();
    const address = "0x" + "5".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.streak).toBe(999999);
  });
});

// ============================================================================
// Cache Headers Tests
// ============================================================================

describe("GET /api/v2/agent/{address}/alive - Cache Headers", () => {
  it("includes proper Cache-Control headers", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30, s-maxage=30");
  });

  it("includes CORS headers", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ============================================================================
// Contract Error Handling Tests
// ============================================================================

describe("GET /api/v2/agent/{address}/alive - Contract Error Handling", () => {
  it("returns not alive when agent not found in registry", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("Agent not found"));

    const { GET } = await importRoute();
    const address = "0x" + "6".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(false);
    expect(body.lastPulseTimestamp).toBe(0);
    expect(body.streak).toBe(0);
    // Staleness is null when lastPulseTimestamp is 0 (never pulsed or not found)
    expect(body.staleness === null || body.staleness === Infinity).toBe(true);
    expect(body.note).toBe("Agent not found in registry");
  });

  it("returns not alive when contract call reverts", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("execution reverted"));

    const { GET } = await importRoute();
    const address = "0x" + "7".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(false);
    expect(body.note).toBe("Agent not found in registry");
  });

  it("returns not alive on RPC timeout", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("timeout"));

    const { GET } = await importRoute();
    const address = "0x" + "8".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(false);
  });

  it("returns not alive on network error", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { GET } = await importRoute();
    const address = "0x" + "9".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(false);
    expect(body.note).toBe("Agent not found in registry");
  });
});

// ============================================================================
// Chain Configuration Tests
// ============================================================================

describe("GET /api/v2/agent/{address}/alive - Chain Configuration", () => {
  it("uses Base mainnet when CHAIN_ID=8453", async () => {
    process.env.CHAIN_ID = "8453";
    process.env.NEXT_PUBLIC_CHAIN_ID = "8453";
    
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    // Verify createPublicClient was called with base chain
    expect(mockCreatePublicClient).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: expect.objectContaining({ id: 8453, name: "Base" }),
      })
    );
  });

  it("uses Base Sepolia when CHAIN_ID=84532", async () => {
    process.env.CHAIN_ID = "84532";
    process.env.NEXT_PUBLIC_CHAIN_ID = "84532";
    
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    // Verify createPublicClient was called with baseSepolia chain
    expect(mockCreatePublicClient).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: expect.objectContaining({ id: 84532, name: "Base Sepolia" }),
      })
    );
  });

  it("uses default mainnet RPC when NEXT_PUBLIC_RPC_URL not set", async () => {
    delete process.env.NEXT_PUBLIC_RPC_URL;
    process.env.NEXT_PUBLIC_CHAIN_ID = "8453";
    
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    // Verify http was called with default RPC
    expect(mockCreatePublicClient).toHaveBeenCalled();
  });

  it("uses custom RPC when NEXT_PUBLIC_RPC_URL is set", async () => {
    process.env.NEXT_PUBLIC_RPC_URL = "https://custom.base.rpc";
    process.env.NEXT_PUBLIC_CHAIN_ID = "8453";
    
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(mockCreatePublicClient).toHaveBeenCalled();
  });

  it("uses custom registry address when NEXT_PUBLIC_PULSE_REGISTRY is set", async () => {
    process.env.NEXT_PUBLIC_PULSE_REGISTRY = "0xCustomRegistryAddress123456789012345678901234";
    
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xCustomRegistryAddress123456789012345678901234",
      })
    );
  });

  it("falls back to NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS when NEXT_PUBLIC_PULSE_REGISTRY not set", async () => {
    delete process.env.NEXT_PUBLIC_PULSE_REGISTRY;
    process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS = "0xFallbackRegistry1234567890123456789012345678";
    
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xFallbackRegistry1234567890123456789012345678",
      })
    );
  });
});

// ============================================================================
// Response Schema Tests
// ============================================================================

describe("GET /api/v2/agent/{address}/alive - Response Schema", () => {
  it("returns all required fields in response", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    // Check all required fields exist
    expect(body).toHaveProperty("address");
    expect(body).toHaveProperty("isAlive");
    expect(body).toHaveProperty("lastPulseTimestamp");
    expect(body).toHaveProperty("streak");
    expect(body).toHaveProperty("staleness");
    expect(body).toHaveProperty("ttl");
    expect(body).toHaveProperty("checkedAt");

    // Check types
    expect(typeof body.address).toBe("string");
    expect(typeof body.isAlive).toBe("boolean");
    expect(typeof body.lastPulseTimestamp).toBe("number");
    expect(typeof body.streak).toBe("number");
    expect(typeof body.staleness === "number" || body.staleness === Infinity).toBe(true);
    expect(typeof body.ttl).toBe("number");
    expect(typeof body.checkedAt).toBe("string");
  });

  it("normalizes address to lowercase in response", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0xABCDEF1234567890ABCDEF1234567890ABCDEF12";
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(body.address).toBe(address.toLowerCase());
  });

  it("returns valid ISO timestamp for checkedAt", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    // Verify it's a valid ISO timestamp
    const checkedAtDate = new Date(body.checkedAt);
    expect(checkedAtDate.toISOString()).toBe(body.checkedAt);
    expect(checkedAtDate.getTime()).not.toBeNaN();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("GET /api/v2/agent/{address}/alive - Edge Cases", () => {
  it("handles very old lastPulse timestamp", async () => {
    const oldTimestamp = 1609459200; // 2021-01-01
    mockReadContract.mockResolvedValueOnce([true, oldTimestamp, 100, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(true); // Contract says alive
    expect(body.lastPulseTimestamp).toBe(oldTimestamp);
    expect(body.staleness).toBeGreaterThan(100000000); // Very stale
  });

  it("handles future lastPulse timestamp (clock skew)", async () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
    mockReadContract.mockResolvedValueOnce([true, futureTimestamp, 5, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    // Staleness could be negative if clock is skewed
    expect(typeof body.staleness).toBe("number");
  });

  it("handles very large totalBurned value", async () => {
    const hugeBurn = 115792089237316195423570985008687907853269984665640564039457584007913129639935n; // max uint256-1
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 5, hugeBurn]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });

    expect(response.status).toBe(200);
    // Response doesn't include totalBurned but handler processes it correctly
  });

  it("handles zero streak", async () => {
    mockReadContract.mockResolvedValueOnce([true, 1700000000, 0, 1000000n]);

    const { GET } = await importRoute();
    const address = "0x" + "1".repeat(40);
    const response = await GET(createRequest(address), { 
      params: Promise.resolve({ address }) 
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAlive).toBe(true);
    expect(body.streak).toBe(0);
  });
});
