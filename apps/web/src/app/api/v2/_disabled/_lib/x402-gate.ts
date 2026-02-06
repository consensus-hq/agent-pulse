import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { MetricsCollector } from "@/lib/metrics";
import { PRICING_V2, calculatePrice } from "@/lib/pricing";
import { 
  settleX402Payment, 
  create402Response, 
  hasPaymentHeader, 
  PaymentResult 
} from "@/lib/x402";

/**
 * x402 Payment Gate - Shared Helper for V2 Paid API Endpoints
 *
 * This module provides x402 integration for payment-gated API v2 endpoints.
 * External agents pay USDC to access agent-specific data endpoints.
 */

// ============================================
// CONFIGURATION
// ============================================

export const REGISTRY_CONTRACT = (process.env.NEXT_PUBLIC_PULSE_REGISTRY_ADDRESS || "0xe61C615743A02983A46aFF66Db035297e8a43846") as `0x${string}`;
export const CHAIN_ID = 84532; // Base Sepolia
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

// ============================================
// PRICE CONFIGURATION
// ============================================

/**
 * Mapping from endpoint name to PRICING_V2 constant (bigint, USDC 6 decimals).
 * All prices are sourced from pricing.ts — no hardcoded values here.
 */
const ENDPOINT_BASE_PRICES = {
  reliability: PRICING_V2.RELIABILITY,
  livenessProof: PRICING_V2.LIVENESS_PROOF,
  signalHistory: PRICING_V2.SIGNAL_HISTORY,
  streakAnalysis: PRICING_V2.STREAK_ANALYSIS,
  peerCorrelation: PRICING_V2.PEER_CORRELATION,
  uptimeMetrics: PRICING_V2.UPTIME,
  predictiveInsights: PRICING_V2.PREDICTIVE_INSIGHTS,
  globalStats: PRICING_V2.GLOBAL_STATS,
  reliabilityPortfolio: PRICING_V2.BUNDLE_RISK,
  peerGraph: PRICING_V2.BUNDLE_FLEET,
  uptimeHealth: PRICING_V2.BUNDLE_ROUTER,
  attest: PRICING_V2.ATTEST,
  attestations: PRICING_V2.ATTESTATIONS,
  reputation: PRICING_V2.REPUTATION,
} as const;

export type V2Endpoint = keyof typeof ENDPOINT_BASE_PRICES;

export { calculatePrice };

/**
 * Convert atomic USDC (6 decimals) bigint to "$X.XX…" string for x402 challenges.
 */
function atomicToUsdString(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const frac = atomic % 1_000_000n;
  let fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  if (fracStr.length < 2) fracStr = fracStr.padEnd(2, "0");
  return `$${whole}.${fracStr}`;
}

/**
 * Human-readable price strings derived from PRICING_V2 constants.
 */
export const PRICES: Record<V2Endpoint, string> = Object.fromEntries(
  Object.entries(ENDPOINT_BASE_PRICES).map(([k, v]) => [k, atomicToUsdString(v)])
) as Record<V2Endpoint, string>;

/**
 * Micro-USDC prices (integer, 6-decimal atomic units) derived from PRICING_V2.
 */
export const PRICES_MICRO_USDC: Record<V2Endpoint, number> = Object.fromEntries(
  Object.entries(ENDPOINT_BASE_PRICES).map(([k, v]) => [k, Number(v)])
) as Record<V2Endpoint, number>;

/**
 * Get freshness-adjusted price for an endpoint.
 * cacheAgeSeconds = 0 → real-time (1.5x), ≤3600 → cached (0.5x), else base.
 */
export function getDynamicPrice(endpoint: V2Endpoint, cacheAgeSeconds: number = -1): string {
  const base = ENDPOINT_BASE_PRICES[endpoint];
  if (cacheAgeSeconds < 0) return atomicToUsdString(base);
  return atomicToUsdString(calculatePrice(base, cacheAgeSeconds));
}

export const CACHE_TTLS: Record<V2Endpoint, number> = {
  reliability: 300,
  livenessProof: 30,
  signalHistory: 900,
  streakAnalysis: 300,
  peerCorrelation: 3600,
  uptimeMetrics: 900,
  predictiveInsights: 300,
  globalStats: 3600,
  reliabilityPortfolio: 300,
  peerGraph: 600,
  uptimeHealth: 600,
  attest: 0,
  attestations: 60,
  reputation: 300,
};

// ============================================
// RATE LIMITING
// ============================================

const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_TTL_SECONDS = 60;

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (request as unknown as { ip?: string }).ip || "unknown";
}

function getRateLimitKey(ip: string): string {
  const now = new Date();
  const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `ratelimit:v2:${ip}:${minuteBucket}`;
}

export async function checkRateLimit(request: NextRequest) {
  const ip = getClientIP(request);
  const key = getRateLimitKey(ip);
  const current = (await kv.get<number>(key)) || 0;
  if (current >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, remaining: 0, resetAfter: RATE_LIMIT_TTL_SECONDS };
  }
  return { allowed: true, remaining: RATE_LIMIT_PER_MINUTE - current, resetAfter: RATE_LIMIT_TTL_SECONDS };
}

export async function incrementRateLimit(request: NextRequest): Promise<void> {
  const ip = getClientIP(request);
  const key = getRateLimitKey(ip);
  const pipeline = kv.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, RATE_LIMIT_TTL_SECONDS);
  await pipeline.exec();
}

export async function trackPaidCall(endpoint: V2Endpoint): Promise<void> {
  const dateKey = new Date().toISOString().split('T')[0];
  const callsKey = `stats:daily:${dateKey}:v2:${endpoint}:calls`;
  const revenueKey = `stats:daily:${dateKey}:v2:${endpoint}:revenue`;
  const revenueMicroUsdc = PRICES_MICRO_USDC[endpoint] || 0;
  const pipeline = kv.pipeline();
  pipeline.incr(callsKey);
  pipeline.incrby(revenueKey, revenueMicroUsdc);
  pipeline.expire(callsKey, 86400);
  pipeline.expire(revenueKey, 86400);
  await pipeline.exec();
}

export async function x402Gate<T>(
  request: NextRequest,
  options: { endpoint: V2Endpoint; price: string; cacheKey?: string; skipCache?: boolean },
  handler: (payment?: PaymentResult["payment"]) => Promise<NextResponse<T>>
): Promise<NextResponse> {
  const { endpoint, price, cacheKey, skipCache } = options;
  const hasPayment = hasPaymentHeader(request);

  if (!hasPayment) {
    const rateLimit = await checkRateLimit(request);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: "Rate limit exceeded. Payment required for unlimited access.",
        limit: `${RATE_LIMIT_PER_MINUTE} req/min`,
        retryAfter: rateLimit.resetAfter,
      }, {
        status: 429,
        headers: { "X-RateLimit-Limit": String(RATE_LIMIT_PER_MINUTE), "Retry-After": String(rateLimit.resetAfter) },
      }) as NextResponse;
    }

    if (cacheKey && !skipCache) {
      const cached = await kv.get<T>(cacheKey);
      if (cached) {
        await incrementRateLimit(request);
        await MetricsCollector.trackCall(endpoint, false);
        return NextResponse.json({ ...cached, _cached: true, _tier: "free" }) as NextResponse;
      }
    }

    await incrementRateLimit(request);
    await MetricsCollector.trackCall(endpoint, false);
    return create402Response(price, request.url) as NextResponse;
  }

  const paymentResult = await settleX402Payment(request, price);
  if (paymentResult.status !== 200) {
    return NextResponse.json({ error: paymentResult.error || "Payment required" }, {
      status: paymentResult.status,
      headers: { "X-Payment-Required": price },
    }) as NextResponse;
  }

  await trackPaidCall(endpoint);
  const revenueMicroUsdc = PRICES_MICRO_USDC[endpoint] || 0;
  await MetricsCollector.trackCall(endpoint, true, revenueMicroUsdc);
  
  const response = await handler(paymentResult.payment);
  const data = await response.json();
  return NextResponse.json({ ...data, _payment: paymentResult.payment, _tier: "paid" }) as NextResponse;
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
