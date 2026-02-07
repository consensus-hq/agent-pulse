export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { withPaymentGate, PRICES } from "../x402";
import { getPaymentWallet, HEYELSA_BASE_URL } from "../../defi/route";

/**
 * Paid Health Check Endpoint
 *
 * Price: $0.001 per call (USDC on Base)
 *
 * Returns system health metrics including:
 * - Hot wallet status and address
 * - Daily spending metrics
 * - Cache hit rates
 * - HeyElsa API connectivity
 * - Service availability
 *
 * Access modes:
 * - x402 payment via X-PAYMENT header
 * - API key bypass via X-API-KEY header (matches PAID_API_BYPASS_KEY env)
 */

interface HealthData {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  wallet: {
    address: string;
    status: "connected" | "disconnected";
  } | null;
  budget: {
    spentToday: number;
    maxDaily: number;
    remaining: number;
    exceeded: boolean;
  } | null;
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  } | null;
  services: {
    kv: "connected" | "disconnected";
    heyelsa: "connected" | "disconnected" | "unknown";
  };
  _payment: {
    payer: string;
    amount: string;
    timestamp: string;
    method: string;
  };
}

async function getDailySpend(): Promise<bigint> {
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const key = `budget:daily:${dateKey}`;
  const spend = await kv.get<string>(key);
  return spend ? BigInt(spend) : 0n;
}

async function getCacheHitRate(): Promise<{ hits: number; misses: number; rate: number }> {
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const hitsKey = `stats:daily:${dateKey}:cacheHits`;
  const missesKey = `stats:daily:${dateKey}:cacheMisses`;

  const [rawHits, rawMisses] = await Promise.all([
    kv.get<number>(hitsKey),
    kv.get<number>(missesKey),
  ]);

  const hits = rawHits ?? 0;
  const misses = rawMisses ?? 0;
  const total = hits + misses;
  const rate = total > 0 ? Math.round((hits / total) * 100) : 0;

  return { hits, misses, rate };
}

async function checkKVConnection(): Promise<"connected" | "disconnected"> {
  try {
    await kv.ping();
    return "connected";
  } catch {
    return "disconnected";
  }
}

async function checkHeyElsaConnection(): Promise<"connected" | "disconnected"> {
  try {
    // HeyElsa returns 402 for valid endpoints (which means it's reachable)
    const res = await fetch(`${HEYELSA_BASE_URL}/api/get_token_price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_address: "0x0000000000000000000000000000000000000000" }),
      signal: AbortSignal.timeout(5000),
    });
    // 402 = reachable and responding correctly (x402 payment required)
    // Any other status means the endpoint isn't behaving as expected
    return res.status === 402 ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

export const GET = withPaymentGate<HealthData>(PRICES.health, async (request, payment) => {
  try {
    // Check wallet status
    let wallet: HealthData["wallet"] = null;
    try {
      const walletClient = getPaymentWallet();
      wallet = {
        address: walletClient.account.address,
        status: "connected",
      };
    } catch (error) {
      console.warn("[Paid Health] Wallet not configured:", error);
    }

    // Get budget metrics
    const dailySpend = await getDailySpend();
    const DAILY_BUDGET_USDC_ATOMIC = 1000000n; // $1.00 USDC
    const budget = {
      spentToday: Number(dailySpend) / 1_000_000,
      maxDaily: 1.0,
      remaining: Math.max(0, Number(DAILY_BUDGET_USDC_ATOMIC - dailySpend) / 1_000_000),
      exceeded: dailySpend >= DAILY_BUDGET_USDC_ATOMIC,
    };

    // Get cache metrics
    const { hits, misses, rate } = await getCacheHitRate();
    const cache = { hits, misses, hitRate: rate };

    // Check services
    const [kvStatus, heyElsaStatus] = await Promise.all([
      checkKVConnection(),
      checkHeyElsaConnection(),
    ]);

    // Determine overall health
    let status: HealthData["status"] = "healthy";
    if (kvStatus === "disconnected" || !wallet) {
      status = "unhealthy";
    } else if (budget.exceeded || heyElsaStatus === "disconnected") {
      status = "degraded";
    }

    return NextResponse.json({
      status,
      timestamp: new Date().toISOString(),
      wallet,
      budget,
      cache,
      services: {
        kv: kvStatus,
        heyelsa: heyElsaStatus,
      },
      _payment: {
        payer: payment.payer,
        amount: payment.amount,
        timestamp: payment.timestamp,
        method: payment.method,
      },
    });
  } catch (error) {
    console.error("[Paid Health] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({
      status: "unhealthy" as const,
      timestamp: new Date().toISOString(),
      wallet: null,
      budget: null,
      cache: null,
      services: {
        kv: "disconnected",
        heyelsa: "unknown",
      },
      error: message,
      _payment: {
        payer: payment.payer,
        amount: payment.amount,
        timestamp: payment.timestamp,
        method: payment.method,
      },
    });
  }
});

// Support HEAD for health checks
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}
