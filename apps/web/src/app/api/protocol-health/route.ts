import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { checkKVHealth, getPauseState, getTotalAgents } from "@/app/lib/kv";
import { readPauseState, readTotalAgents } from "@/app/lib/chain";

export const runtime = "edge";

// ============================================================================
// Configuration
// ============================================================================

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 30;

// ============================================================================
// Types
// ============================================================================

type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ProtocolHealthResponse {
  paused: boolean;
  totalAgents: number;
  kvHealthy: boolean;
  rpcHealthy: boolean;
  status: HealthStatus;
}

export interface ErrorResponse {
  error: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * KV-backed rate limiting for Edge Functions.
 * Uses Vercel KV INCR with TTL — no in-memory state.
 */
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `ratelimit:health:${ip}`;
  const resetAt = Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000;

  try {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - count);
    return { allowed: count <= RATE_LIMIT_MAX_REQUESTS, remaining, resetAt };
  } catch {
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS, resetAt };
  }
}

/**
 * Determine overall health status
 */
function determineHealthStatus(kvHealthy: boolean, rpcHealthy: boolean): HealthStatus {
  if (kvHealthy && rpcHealthy) {
    return "healthy";
  }
  if (!kvHealthy && !rpcHealthy) {
    return "unhealthy";
  }
  // One up, one down = degraded
  return "degraded";
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(
  request: NextRequest
): Promise<NextResponse<ProtocolHealthResponse | ErrorResponse>> {
  // Get client IP for rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             request.headers.get("x-real-ip") ||
             "unknown";

  // Check rate limit
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      }
    );
  }

  // Check service health in parallel
  const kvHealth = await checkKVHealth();

  // Check RPC health via thirdweb SDK
  let rpcHealthy = false;
  let rpcLatencyMs = 0;
  const rpcStartTime = Date.now();

  try {
    // Try to read pause state as a simple health check
    const pauseResult = await readPauseState();
    rpcHealthy = pauseResult !== null;
    rpcLatencyMs = Date.now() - rpcStartTime;
  } catch (error) {
    rpcHealthy = false;
    rpcLatencyMs = Date.now() - rpcStartTime;
  }

  // Get protocol data
  let paused: boolean;
  let totalAgents: number;
  let dataSource: "kv" | "chain" = "kv";

  // Try KV first if healthy
  if (kvHealth.healthy) {
    const [kvPaused, kvTotal] = await Promise.all([
      getPauseState(),
      getTotalAgents(),
    ]);

    if (kvPaused !== null && kvTotal !== null) {
      paused = kvPaused;
      totalAgents = kvTotal;
    } else {
      // KV healthy but data missing - try chain
      dataSource = "chain";
      const [chainPaused, chainTotal] = await Promise.all([
        readPauseState(),
        readTotalAgents(),
      ]);

      paused = chainPaused ?? false;
      totalAgents = chainTotal !== null ? Number(chainTotal) : 0;
    }
  } else {
    // KV down - try chain
    dataSource = "chain";
    const [chainPaused, chainTotal] = await Promise.all([
      readPauseState(),
      readTotalAgents(),
    ]);

    if (chainPaused !== null) {
      paused = chainPaused;
      totalAgents = chainTotal !== null ? Number(chainTotal) : 0;
    } else {
      // Both KV and chain failed - return error
      return NextResponse.json(
        { error: "Service unavailable - unable to fetch protocol data" },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "Retry-After": "5",
          },
        }
      );
    }
  }

  // Determine overall health status
  const healthStatus = determineHealthStatus(kvHealth.healthy, rpcHealthy);

  const response: ProtocolHealthResponse = {
    paused,
    totalAgents,
    kvHealthy: kvHealth.healthy,
    rpcHealthy,
    status: healthStatus,
  };

  // Return appropriate status code based on health
  const statusCode = healthStatus === "unhealthy" ? 503 : 200;

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rateLimit.remaining),
      "X-KV-Latency": String(kvHealth.latencyMs),
      "X-RPC-Latency": String(rpcLatencyMs),
      "X-Data-Source": dataSource,
    },
  });
}
