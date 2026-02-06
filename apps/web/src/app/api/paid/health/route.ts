import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { withPayment, PRICES } from "../x402";
import { getPaymentWallet } from "../../defi/route";

/**
 * Paid Health Check Endpoint
 * 
 * Price: $0.001 per call
 * 
 * Returns system health metrics including:
 * - Hot wallet status and address
 * - Daily spending metrics
 * - Cache hit rates
 * - Service availability
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
    heylsa: "connected" | "disconnected" | "unknown";
  };
  _payment: {
    payer: string;
    amount: string;
    timestamp: string;
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

export const GET = withPayment<HealthData>(PRICES.health, async (request, payment) => {
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
    const kvStatus = await checkKVConnection();
    
    // Determine overall health
    let status: HealthData["status"] = "healthy";
    if (kvStatus === "disconnected" || !wallet) {
      status = "unhealthy";
    } else if (budget.exceeded || cache.hitRate < 50) {
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
        heylsa: "unknown",
      },
      _payment: {
        payer: payment.payer,
        amount: payment.amount,
        timestamp: payment.timestamp,
      },
    });
  } catch (error) {
    console.error("[Paid Health] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Return degraded status rather than error
    return NextResponse.json({
      status: "unhealthy" as const,
      timestamp: new Date().toISOString(),
      wallet: null,
      budget: null,
      cache: null,
      services: {
        kv: "disconnected",
        heylsa: "unknown",
      },
      error: message,
      _payment: {
        payer: payment.payer,
        amount: payment.amount,
        timestamp: payment.timestamp,
      },
    });
  }
});

// Support HEAD for health checks
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}
