// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const FREE_LIMIT_MIN = 60;
const FREE_LIMIT_DAY = 1000;
const AGENT_LIMIT_MIN = 10;

const WINDOW_MIN = 60; // 1 minute in seconds
const WINDOW_DAY = 86400; // 1 day in seconds

export type Tier = "free" | "paid";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter?: number;
}

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (req as any).ip || "127.0.0.1";
}

/**
 * Sliding window rate limiter using Vercel KV
 */
async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  const redisKey = `ratelimit:${key}:${windowSeconds}`;

  const pipeline = kv.pipeline();
  // Remove old entries outside the window
  pipeline.zremrangebyscore(redisKey, 0, windowStart);
  // Add current request
  pipeline.zadd(redisKey, { score: now, member: `${now}-${Math.random()}` });
  // Count requests in window
  pipeline.zcard(redisKey);
  // Set expiry for the whole set
  pipeline.expire(redisKey, windowSeconds);

  const results = await pipeline.exec();
  const count = results[2] as number;

  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);

  let retryAfter: number | undefined;
  if (!allowed) {
    // Get the oldest request in the window to calculate when a slot opens up
    const oldest = await kv.zrange<{ score: number; member: string }>(redisKey, 0, 0, { withScores: true });
    if (oldest && oldest.length > 0) {
      const oldestScore = (oldest[0] as any).score;
      retryAfter = Math.max(1, oldestScore + windowSeconds - now);
    } else {
      retryAfter = 1;
    }
  }

  return { allowed, remaining, limit, retryAfter };
}

export async function withRateLimit(
  req: NextRequest,
  tier: Tier = "free"
): Promise<NextResponse | null> {
  const ip = getClientIP(req);
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address")?.toLowerCase();

  // 1. Per-IP Rate Limiting (Free tier only)
  if (tier === "free") {
    const minLimit = await checkRateLimit(`ip:${ip}:min`, FREE_LIMIT_MIN, WINDOW_MIN);
    if (!minLimit.allowed) {
      return create429Response(minLimit);
    }

    const dayLimit = await checkRateLimit(`ip:${ip}:day`, FREE_LIMIT_DAY, WINDOW_DAY);
    if (!dayLimit.allowed) {
      return create429Response(dayLimit);
    }
  }

  // 2. Per-Agent Rate Limiting (10 req/min per target address)
  if (address) {
    const agentLimit = await checkRateLimit(`agent:${address}:min`, AGENT_LIMIT_MIN, WINDOW_MIN);
    if (!agentLimit.allowed) {
      return create429Response(agentLimit);
    }
  }

  return null;
}

function create429Response(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: "Too Many Requests",
      message: `Rate limit exceeded. Limit: ${result.limit} requests.`,
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter || 60),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
