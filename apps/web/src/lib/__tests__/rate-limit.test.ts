import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { withRateLimit } from "../rate-limit";
import { kv } from "@vercel/kv";

vi.mock("@vercel/kv", () => ({
  kv: {
    pipeline: vi.fn(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([0, 0, 1, 1]), // returns 1 for zcard
    })),
    zrange: vi.fn(),
  },
}));

describe("Rate Limiting Infrastructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createReq = (url: string, ip: string = "1.2.3.4") => {
    return new NextRequest(new URL(url), {
      headers: { "x-forwarded-for": ip },
    });
  };

  it("allows requests within free tier limits", async () => {
    const req = createReq("https://api.example.com/v2/reliability");
    const response = await withRateLimit(req, "free");
    expect(response).toBeNull();
  });

  it("blocks requests exceeding limits with 429", async () => {
    // Mock kv to return high count
    vi.mocked(kv.pipeline).mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([0, 0, 100, 1]), // 100 > 60
    } as any);

    const req = createReq("https://api.example.com/v2/reliability");
    const response = await withRateLimit(req, "free");

    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeDefined();
  });

  it("enforces per-agent limits", async () => {
    const address = "0x1234567890123456789012345678901234567890";
    const req = createReq(`https://api.example.com/v2/reliability?address=${address}`);
    
    // Mock high count for agent key
    vi.mocked(kv.pipeline).mockImplementation(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockImplementation(async function(this: any) {
        // If it's an agent key, return 20 (limit is 10)
        // This is a simplified mock check
        return [0, 0, 20, 1];
      }),
    } as any));

    const response = await withRateLimit(req, "paid"); // Paid bypasses IP limit but not agent limit
    expect(response?.status).toBe(429);
  });
});
