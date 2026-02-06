import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { getAgentState, setAgentState } from "@/app/lib/kv";
import { readAgentStatus, readTTL } from "@/app/lib/chain";

export const runtime = "nodejs";

// ============================================================================
// Configuration
// ============================================================================

const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// ============================================================================
// Types
// ============================================================================

export interface AgentStatusResponse {
  address: string;
  isAlive: boolean;
  streak: number;
  lastPulse: number;
  hazardScore: number;
  ttlSeconds: number;
  source: "cache" | "chain";
  updatedAt: number;
}

export interface ErrorResponse {
  error: string;
  status: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate Ethereum address (simple regex check)
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * KV-backed rate limiting for Edge Functions.
 * Uses Vercel KV INCR with TTL — no in-memory state.
 */
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `ratelimit:status:${ip}`;
  const resetAt = Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000;

  try {
    const count = await kv.incr(key);
    if (count === 1) {
      // First request in window — set TTL
      await kv.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - count);
    return { allowed: count <= RATE_LIMIT_MAX_REQUESTS, remaining, resetAt };
  } catch {
    // KV failure — allow request (fail open for availability)
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS, resetAt };
  }
}

/**
 * Calculate hazard score based on time since last pulse
 */
function calculateHazardScore(lastPulseAt: number, protocolTtlSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - lastPulseAt;

  if (elapsed <= 0) return 0;
  if (elapsed >= protocolTtlSeconds) return 100;

  // Linear scale from 0 to 100 over the TTL period
  return Math.floor((elapsed / protocolTtlSeconds) * 100);
}

// ============================================================================
// Main Handler
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse<AgentStatusResponse | ErrorResponse>> {
  // Get client IP for rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
             request.headers.get("x-real-ip") ||
             "unknown";

  // Check rate limit
  const rateLimit = await checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", status: "rate_limited" },
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

  // Get and validate address
  const { address: rawAddress } = await params;
  const address = normalizeAddress(rawAddress);

  if (!isValidAddress(address)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address format", status: "invalid" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  }

  // Step 2: Try KV cache first
  const cached = await getAgentState(address);

  // Cache HIT: All critical fields present
  if (cached !== null) {
    // Get TTL for hazard score calculation
    const ttlResult = await readTTL();
    const ttlSeconds = ttlResult ? Number(ttlResult) : 86400; // Default 24h

    const response: AgentStatusResponse = {
      address,
      isAlive: cached.isAlive,
      streak: cached.streak,
      lastPulse: cached.lastPulse,
      hazardScore: cached.hazardScore ?? calculateHazardScore(cached.lastPulse, ttlSeconds),
      ttlSeconds,
      source: "cache",
      updatedAt: Date.now(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-Cache-Status": "HIT",
      },
    });
  }

  // Step 3: Cache MISS - fetch from chain via thirdweb SDK
  const [chainStatus, ttlResult] = await Promise.all([
    readAgentStatus(address),
    readTTL(),
  ]);

  // Step 4: Handle chain read failure
  if (chainStatus === null) {
    return NextResponse.json(
      { error: "Failed to fetch agent status from chain", status: "unavailable" },
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

  const ttlSeconds = ttlResult ? Number(ttlResult) : 86400; // Default 24h

  // Calculate hazard score
  const lastPulse = Number(chainStatus.lastPulseAt);
  const hazardScore = calculateHazardScore(lastPulse, ttlSeconds);

  // Prepare response data
  const responseData: AgentStatusResponse = {
    address,
    isAlive: chainStatus.alive,
    streak: Number(chainStatus.streak),
    lastPulse,
    hazardScore,
    ttlSeconds,
    source: "chain",
    updatedAt: Date.now(),
  };

  // Step 4: Populate KV cache (fire and forget)
  setAgentState(address, {
    isAlive: chainStatus.alive,
    lastPulse,
    streak: Number(chainStatus.streak),
    hazardScore,
  }).catch(console.error);

  return NextResponse.json(responseData, {
    headers: {
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rateLimit.remaining),
      "X-Cache-Status": "MISS",
    },
  });
}
