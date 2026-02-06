import { describe, it, expect, vi, beforeEach } from "vitest";
import { withCache, generateCacheKey } from "../cache";
import { kv } from "@vercel/kv";

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("Caching Infrastructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached data on HIT", async () => {
    const mockData = { test: "data" };
    const timestamp = Date.now() - 30000; // 30s ago
    vi.mocked(kv.get).mockResolvedValue({ data: mockData, timestamp });

    const fetchFn = vi.fn();
    const result = await withCache("test-key", 60, fetchFn);

    expect(result.data).toEqual(mockData);
    expect(result.status).toBe("HIT");
    expect(result.age).toBeGreaterThanOrEqual(30);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("calls fetchFn and stores data on MISS", async () => {
    vi.mocked(kv.get).mockResolvedValue(null);
    const mockData = { fresh: "data" };
    const fetchFn = vi.fn().mockResolvedValue(mockData);

    const result = await withCache("test-key", 60, fetchFn);

    expect(result.data).toEqual(mockData);
    expect(result.status).toBe("MISS");
    expect(result.age).toBe(0);
    expect(fetchFn).toHaveBeenCalled();
    expect(kv.set).toHaveBeenCalledWith(
      "test-key",
      expect.objectContaining({ data: mockData }),
      { ex: 60 }
    );
  });

  it("generates consistent cache keys", () => {
    const key1 = generateCacheKey("reliability", "0x123", { param: "a" });
    const key2 = generateCacheKey("reliability", "0x123", { param: "a" });
    const key3 = generateCacheKey("reliability", "0x123", { param: "b" });

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toContain("v2:reliability:0x123:");
  });
});
