import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isAlive,
  filterAlive,
  filterAliveDetailed,
  PulseFilter,
  type AliveResponse,
} from "../index.js";

// ============================================================================
// Mock setup
// ============================================================================

const mockFetch = vi.fn<
  [input: string | URL | Request, init?: RequestInit | undefined],
  Promise<Response>
>();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Helper to create a mock API response. */
function makeAliveResponse(overrides: Partial<AliveResponse> = {}): AliveResponse {
  return {
    address: "0x1111111111111111111111111111111111111111",
    isAlive: true,
    lastPulseTimestamp: Math.floor(Date.now() / 1000) - 100,
    streak: 5,
    staleness: 100,
    ttl: 86400,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ============================================================================
// isAlive
// ============================================================================

describe("isAlive", () => {
  it("returns true for an alive agent", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

    const result = await isAlive("0x1111111111111111111111111111111111111111");
    expect(result).toBe(true);
  });

  it("returns false for a dead agent", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeAliveResponse({ isAlive: false })),
    );

    const result = await isAlive("0x1111111111111111111111111111111111111111");
    expect(result).toBe(false);
  });

  it("throws on invalid address format", async () => {
    await expect(isAlive("not-an-address")).rejects.toThrow("Invalid Ethereum address");
  });

  it("throws on short address", async () => {
    await expect(isAlive("0x123")).rejects.toThrow("Invalid Ethereum address");
  });

  it("respects threshold — alive within threshold", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeAliveResponse({ isAlive: true, staleness: 500 })),
    );

    const result = await isAlive("0x1111111111111111111111111111111111111111", {
      threshold: 3600,
    });
    expect(result).toBe(true);
  });

  it("respects threshold — dead beyond threshold", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeAliveResponse({ isAlive: true, staleness: 7200 })),
    );

    const result = await isAlive("0x1111111111111111111111111111111111111111", {
      threshold: 3600,
    });
    expect(result).toBe(false);
  });

  it("treats null staleness as alive when isAlive is true", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeAliveResponse({ isAlive: true, staleness: null })),
    );

    const result = await isAlive("0x1111111111111111111111111111111111111111", {
      threshold: 3600,
    });
    expect(result).toBe(true);
  });

  it("calls the correct API URL", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

    await isAlive("0xABCDEF1234567890ABCDEF1234567890ABCDEF12");

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toBe(
      "https://agent-pulse-nine.vercel.app/api/v2/agent/0xABCDEF1234567890ABCDEF1234567890ABCDEF12/alive",
    );
  });

  it("uses custom API URL", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

    await isAlive("0x1111111111111111111111111111111111111111", {
      apiUrl: "https://custom.api.example.com",
    });

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl.startsWith("https://custom.api.example.com/api/v2/agent/")).toBe(true);
  });

  it("retries on 500 errors", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

    const result = await isAlive("0x1111111111111111111111111111111111111111", {
      retries: 2,
      retryDelayMs: 10, // Fast for tests
    });

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 404", async () => {
    mockFetch.mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    await expect(
      isAlive("0x1111111111111111111111111111111111111111", {
        retries: 2,
        retryDelayMs: 10,
      }),
    ).rejects.toThrow("HTTP 404");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws after all retries exhausted on server error", async () => {
    mockFetch.mockResolvedValue(
      new Response("Bad Gateway", { status: 502 }),
    );

    await expect(
      isAlive("0x1111111111111111111111111111111111111111", {
        retries: 1,
        retryDelayMs: 10,
      }),
    ).rejects.toThrow("HTTP 502");

    // 1 initial + 1 retry = 2
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on network errors (fetch throws)", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

    const result = await isAlive("0x1111111111111111111111111111111111111111", {
      retries: 1,
      retryDelayMs: 10,
    });

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// filterAlive
// ============================================================================

describe("filterAlive", () => {
  it("returns only alive addresses", async () => {
    const addr1 = "0x1111111111111111111111111111111111111111";
    const addr2 = "0x2222222222222222222222222222222222222222";
    const addr3 = "0x3333333333333333333333333333333333333333";

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ address: addr1, isAlive: true })),
      )
      .mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ address: addr2, isAlive: false })),
      )
      .mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ address: addr3, isAlive: true })),
      );

    const result = await filterAlive([addr1, addr2, addr3]);

    expect(result).toEqual([addr1, addr3]);
  });

  it("returns empty array for empty input", async () => {
    const result = await filterAlive([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("excludes invalid addresses without crashing", async () => {
    const valid = "0x1111111111111111111111111111111111111111";
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeAliveResponse({ address: valid, isAlive: true })),
    );

    const result = await filterAlive([valid, "bad-address", "0xshort"]);
    expect(result).toEqual([valid]);
  });

  it("handles all addresses being invalid", async () => {
    const result = await filterAlive(["abc", "def"]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches all valid addresses concurrently", async () => {
    const addresses = Array.from({ length: 5 }, (_, i) =>
      `0x${String(i + 1).repeat(40).slice(0, 40)}`,
    );

    for (const addr of addresses) {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ address: addr, isAlive: true })),
      );
    }

    const result = await filterAlive(addresses);
    expect(result).toHaveLength(5);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });
});

// ============================================================================
// filterAliveDetailed
// ============================================================================

describe("filterAliveDetailed", () => {
  it("returns full details including errors", async () => {
    const alive = "0x1111111111111111111111111111111111111111";
    const dead = "0x2222222222222222222222222222222222222222";
    const invalid = "not-valid";

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ address: alive, isAlive: true })),
      )
      .mockResolvedValueOnce(
        jsonResponse(makeAliveResponse({ address: dead, isAlive: false })),
      );

    const result = await filterAliveDetailed([alive, dead, invalid]);

    expect(result.alive).toEqual([alive]);
    expect(result.details).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.address).toBe(invalid);
    expect(result.errors[0]!.reason).toContain("Invalid");
    expect(result.checkedAt).toBeTruthy();
  });

  it("records network errors in errors array", async () => {
    const addr = "0x1111111111111111111111111111111111111111";

    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await filterAliveDetailed([addr], {
      retries: 0,
      retryDelayMs: 10,
    });

    expect(result.alive).toEqual([]);
    expect(result.details).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.reason).toContain("Network timeout");
  });

  it("applies threshold to detailed results", async () => {
    const fresh = "0x1111111111111111111111111111111111111111";
    const stale = "0x2222222222222222222222222222222222222222";

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          makeAliveResponse({ address: fresh, isAlive: true, staleness: 100 }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          makeAliveResponse({ address: stale, isAlive: true, staleness: 5000 }),
        ),
      );

    const result = await filterAliveDetailed([fresh, stale], {
      threshold: 3600,
    });

    expect(result.alive).toEqual([fresh]);
    expect(result.details).toHaveLength(2);
  });
});

// ============================================================================
// PulseFilter class
// ============================================================================

describe("PulseFilter", () => {
  it("constructs with default options", () => {
    const filter = new PulseFilter();
    expect(filter).toBeInstanceOf(PulseFilter);
  });

  it("constructs with custom options", () => {
    const filter = new PulseFilter({
      apiUrl: "https://custom.api",
      threshold: 3600,
      timeoutMs: 5000,
      retries: 3,
    });
    expect(filter).toBeInstanceOf(PulseFilter);
  });

  it("isAlive delegates to the underlying function", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

    const filter = new PulseFilter({ threshold: 3600 });
    const result = await filter.isAlive("0x1111111111111111111111111111111111111111");

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("filterAlive delegates to the underlying function", async () => {
    const addr = "0x1111111111111111111111111111111111111111";
    mockFetch.mockResolvedValueOnce(
      jsonResponse(makeAliveResponse({ address: addr, isAlive: true })),
    );

    const filter = new PulseFilter();
    const result = await filter.filterAlive([addr]);

    expect(result).toEqual([addr]);
  });

  it("getStatus returns the full API response", async () => {
    const expected = makeAliveResponse({
      streak: 42,
      staleness: 300,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse(expected));

    const filter = new PulseFilter();
    const status = await filter.getStatus("0x1111111111111111111111111111111111111111");

    expect(status.streak).toBe(42);
    expect(status.staleness).toBe(300);
  });

  it("getStatus throws on invalid address", async () => {
    const filter = new PulseFilter();
    await expect(filter.getStatus("bad")).rejects.toThrow("Invalid Ethereum address");
  });

  it("uses configured API URL across calls", async () => {
    const customUrl = "https://my-pulse-api.example.com";
    mockFetch
      .mockResolvedValueOnce(jsonResponse(makeAliveResponse()))
      .mockResolvedValueOnce(jsonResponse(makeAliveResponse()));

    const filter = new PulseFilter({ apiUrl: customUrl });
    await filter.isAlive("0x1111111111111111111111111111111111111111");
    await filter.isAlive("0x2222222222222222222222222222222222222222");

    for (const call of mockFetch.mock.calls) {
      expect((call[0] as string).startsWith(customUrl)).toBe(true);
    }
  });
});

// ============================================================================
// Live integration test (opt-in via PULSE_LIVE_TEST=1)
// ============================================================================

const LIVE = process.env["PULSE_LIVE_TEST"] === "1";

describe.skipIf(!LIVE)("Live API integration", () => {
  beforeEach(() => {
    vi.unstubAllGlobals(); // Restore real fetch for live tests
  });

  it("checks a random address against the live API", async () => {
    const result = await isAlive("0x0000000000000000000000000000000000000001");
    expect(typeof result).toBe("boolean");
  });

  it("filterAliveDetailed returns proper structure from live API", async () => {
    const result = await filterAliveDetailed([
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
    ]);

    expect(result).toHaveProperty("alive");
    expect(result).toHaveProperty("details");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("checkedAt");
    expect(Array.isArray(result.alive)).toBe(true);
    expect(result.details.length).toBeGreaterThanOrEqual(0);
  });

  it("PulseFilter.getStatus returns valid structure", async () => {
    const filter = new PulseFilter();
    const status = await filter.getStatus(
      "0x0000000000000000000000000000000000000001",
    );

    expect(status).toHaveProperty("address");
    expect(status).toHaveProperty("isAlive");
    expect(status).toHaveProperty("lastPulseTimestamp");
    expect(status).toHaveProperty("streak");
    expect(status).toHaveProperty("ttl");
    expect(status).toHaveProperty("checkedAt");
  });
});
