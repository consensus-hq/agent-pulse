import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

/**
 * HeyElsa x402 Server-Side Proxy
 * 
 * Architecture:
 * - APP pays HeyElsa using a dedicated hot wallet (server-side)
 * - Zero wallet popups for users
 * - KV cache for 60 seconds to minimize payments
 * 
 * Security:
 * - HEYELSA_PAYMENT_KEY is server-side only (no NEXT_PUBLIC_ prefix)
 * - Max payment guard: rejects 402 asking for > $0.10 per call
 * - Rate limiting: 10 req/min, 100 req/hour per IP
 * - Daily budget cap: $1.00 USDC max spend
 * - Logs payment amounts for monitoring
 * 
 * Endpoints (VERA-003):
 * - portfolio: POST /api/get_portfolio ($0.01)
 * - balances: POST /api/get_balances ($0.005)
 * - token_price: POST /api/get_token_price ($0.002)
 */

// ============================================
// RATE LIMITING & BUDGET CONSTANTS (WARD)
// ============================================
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_HOUR = 100;
const DAILY_BUDGET_USDC_ATOMIC = 1000000n; // $1.00 USDC (6 decimals)
const RATE_LIMIT_TTL_MINUTES = 60; // 1 minute window
const RATE_LIMIT_TTL_HOURS = 3600; // 1 hour window

// USDC on Base mainnet
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// HeyElsa API base URL (always mainnet — separate from pulse x402)
export const HEYELSA_BASE_URL = process.env.HEYELSA_X402_API_URL || "https://x402-api.heyelsa.ai";

// Security limits
export const MAX_PAYMENT_PER_CALL = 50000n; // $0.05 USDC (6 decimals)
export const CACHE_TTL_SECONDS = 60;

// EIP-3009 TransferWithAuthorization types
const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// EIP-712 Domain for USDC on Base
const getUSDCDomain = () => ({
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: USDC_BASE as `0x${string}`,
});

// Valid actions and their endpoint mappings
const VALID_ACTIONS: Record<string, { endpoint: string; cost: string; cacheable?: boolean }> = {
  portfolio: { endpoint: "/api/get_portfolio", cost: "$0.01" },
  balances: { endpoint: "/api/get_balances", cost: "$0.005" },
  token_price: { endpoint: "/api/get_token_price", cost: "$0.002" },
  swap_quote: { endpoint: "/api/get_swap_quote", cost: "$0.01" },
  execute_swap: { endpoint: "/api/execute_swap", cost: "$0.02", cacheable: false },
  gas_prices: { endpoint: "/api/get_gas_prices", cost: "$0.001" },
  analyze_wallet: { endpoint: "/api/analyze_wallet", cost: "$0.01" },
};

// ============================================
// RATE LIMITING UTILITIES (WARD)
// ============================================

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (request as unknown as { ip?: string }).ip || "unknown";
}

function getTimeBuckets(): { minuteBucket: string; hourBucket: string; dateKey: string } {
  const now = new Date();
  const minuteBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const hourBucket = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}`;
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { minuteBucket, hourBucket, dateKey };
}

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; limitType?: "minute" | "hour" }> {
  const { minuteBucket, hourBucket } = getTimeBuckets();
  const minuteKey = `ratelimit:${ip}:${minuteBucket}`;
  const hourKey = `ratelimit:${ip}:${hourBucket}`;

  const minuteCount = await kv.get<number>(minuteKey) || 0;
  if (minuteCount >= RATE_LIMIT_PER_MINUTE) {
    return { allowed: false, remaining: 0, limitType: "minute" };
  }

  const hourCount = await kv.get<number>(hourKey) || 0;
  if (hourCount >= RATE_LIMIT_PER_HOUR) {
    return { allowed: false, remaining: 0, limitType: "hour" };
  }

  const remaining = Math.min(
    RATE_LIMIT_PER_MINUTE - minuteCount,
    RATE_LIMIT_PER_HOUR - hourCount
  );

  return { allowed: true, remaining };
}

async function incrementRateLimit(ip: string): Promise<void> {
  const { minuteBucket, hourBucket } = getTimeBuckets();
  const minuteKey = `ratelimit:${ip}:${minuteBucket}`;
  const hourKey = `ratelimit:${ip}:${hourBucket}`;

  const pipeline = kv.pipeline();
  pipeline.incr(minuteKey);
  pipeline.incr(hourKey);
  pipeline.expire(minuteKey, RATE_LIMIT_TTL_MINUTES);
  pipeline.expire(hourKey, RATE_LIMIT_TTL_HOURS);
  await pipeline.exec();
}

async function trackRateLimitRejection(): Promise<void> {
  const { dateKey } = getTimeBuckets();
  const key = `stats:daily:${dateKey}:rateLimitRejections`;
  await kv.incr(key);
  await kv.expire(key, 86400);
}

// ============================================
// BUDGET & SPENDING UTILITIES (WARD)
// ============================================

async function getDailySpend(): Promise<bigint> {
  const { dateKey } = getTimeBuckets();
  const key = `budget:daily:${dateKey}`;
  const spend = await kv.get<string>(key);
  return spend ? BigInt(spend) : 0n;
}

async function addToDailySpend(amount: bigint): Promise<void> {
  const { dateKey } = getTimeBuckets();
  const key = `budget:daily:${dateKey}`;
  const current = await getDailySpend();
  const newTotal = current + amount;
  await kv.set(key, newTotal.toString(), { ex: 86400 });
}

async function isBudgetExceeded(): Promise<boolean> {
  const spend = await getDailySpend();
  return spend >= DAILY_BUDGET_USDC_ATOMIC;
}

function logBudgetAlert(spend: bigint): void {
  console.error(`[WARD] DAILY BUDGET EXCEEDED: $${Number(spend) / 1_000_000} USDC spent. Blocking new HeyElsa calls.`);
}

// ============================================
// CACHE STATS UTILITIES (WARD)
// ============================================

async function trackCacheHit(): Promise<void> {
  const { dateKey } = getTimeBuckets();
  const key = `stats:daily:${dateKey}:cacheHits`;
  await kv.incr(key);
  await kv.expire(key, 86400);
}

async function trackCacheMiss(): Promise<void> {
  const { dateKey } = getTimeBuckets();
  const key = `stats:daily:${dateKey}:cacheMisses`;
  await kv.incr(key);
  await kv.expire(key, 86400);
}

async function getCacheHitRate(): Promise<{ hits: number; misses: number; rate: number }> {
  const { dateKey } = getTimeBuckets();
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

async function getRateLimitRejections(): Promise<number> {
  const { dateKey } = getTimeBuckets();
  const key = `stats:daily:${dateKey}:rateLimitRejections`;
  return await kv.get<number>(key) || 0;
}

// ============================================
// WALLET & PAYMENT UTILITIES
// ============================================

export function getPaymentWallet() {
  const privateKey = process.env.HEYELSA_PAYMENT_KEY;
  
  if (!privateKey) {
    throw new Error("HEYELSA_PAYMENT_KEY not configured");
  }

  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(formattedKey as Hex);
  
  return createWalletClient({
    account,
    chain: base,
    transport: http(),
  });
}

export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  paymentRequirements: Array<{
    scheme: string;
    network: string;
    requiredAmount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: Record<string, unknown>;
  }>;
}

export async function parse402Response(response: Response): Promise<PaymentRequirements> {
  const body = await response.json();
  const accepts = body.accepts || body.paymentRequirements || [];
  
  if (accepts.length === 0 && body.payTo) {
    accepts.push(body);
  }

  return {
    scheme: accepts[0]?.scheme || "exact",
    network: accepts[0]?.network || "base",
    maxAmountRequired: accepts[0]?.maxAmountRequired || "0",
    resource: accepts[0]?.resource || "",
    description: accepts[0]?.description || "",
    mimeType: accepts[0]?.mimeType || "application/json",
    paymentRequirements: accepts.map((a: Record<string, unknown>) => ({
      scheme: (a.scheme as string) || "exact",
      network: (a.network as string) || "base",
      requiredAmount: (a.maxAmountRequired as string) || "0",
      asset: (a.asset as string) || USDC_BASE,
      payTo: (a.payTo as string) || "",
      maxTimeoutSeconds: (a.maxTimeoutSeconds as number) || 60,
      extra: a.extra as Record<string, unknown> | undefined,
    })),
  };
}

export async function createPaymentSignature(
  wallet: ReturnType<typeof getPaymentWallet>,
  paymentReq: PaymentRequirements["paymentRequirements"][0]
): Promise<string> {
  const amount = BigInt(paymentReq.requiredAmount);
  
  if (amount > MAX_PAYMENT_PER_CALL) {
    throw new Error(
      `Payment amount ${amount} exceeds max allowed ${MAX_PAYMENT_PER_CALL} ($0.05 USDC)`
    );
  }

  const { randomBytes } = await import("crypto");
  const nonce = ("0x" + randomBytes(32).toString("hex")) as Hex;
  
  const now = Math.floor(Date.now() / 1000);
  const validAfter = 0n;
  const validBefore = BigInt(now + (paymentReq.maxTimeoutSeconds || 300));

  const message = {
    from: wallet.account.address,
    to: paymentReq.payTo as `0x${string}`,
    value: amount,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await wallet.signTypedData({
    domain: getUSDCDomain(),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });

  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      signature,
      authorization: {
        from: wallet.account.address,
        to: paymentReq.payTo,
        value: paymentReq.requiredAmount,
        validAfter: "0",
        validBefore: String(now + (paymentReq.maxTimeoutSeconds || 300)),
        nonce,
      },
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export async function fetchWithPayment(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Response> {
  const wallet = getPaymentWallet();
  const url = `${HEYELSA_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status !== 402) {
    return response;
  }

  const paymentReq = await parse402Response(response);
  const requirement = paymentReq.paymentRequirements?.[0];
  
  if (!requirement) {
    throw new Error("No payment requirements in 402 response");
  }

  console.log(`[HeyElsa x402] Payment required:`, {
    endpoint,
    amount: requirement.requiredAmount,
    asset: requirement.asset,
    payer: wallet.account.address,
  });

  const paymentHeader = await createPaymentSignature(wallet, requirement);

  // Track spending (WARD)
  const paymentAmount = BigInt(requirement.requiredAmount);
  await addToDailySpend(paymentAmount);

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-PAYMENT": paymentHeader,
    },
    body: JSON.stringify(body),
  });
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// ============================================
// HEALTH CHECK HANDLER (WARD)
// ============================================

async function handleHealthCheck(): Promise<NextResponse> {
  try {
    const wallet = getPaymentWallet();
    const spend = await getDailySpend();
    const { hits, misses, rate } = await getCacheHitRate();
    const rejections = await getRateLimitRejections();

    return NextResponse.json({
      walletAddress: wallet.account.address,
      totalSpentToday: {
        atomic: spend.toString(),
        usd: Number(spend) / 1_000_000,
      },
      cacheHitRate: {
        hits,
        misses,
        percentage: rate,
      },
      rateLimitRejectionsToday: rejections,
      budget: {
        maxDaily: Number(DAILY_BUDGET_USDC_ATOMIC) / 1_000_000,
        remaining: Math.max(0, Number(DAILY_BUDGET_USDC_ATOMIC - spend) / 1_000_000),
        exceeded: spend >= DAILY_BUDGET_USDC_ATOMIC,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { 
        error: "Health check failed", 
        message,
        walletAddress: null,
        totalSpentToday: null,
        cacheHitRate: null,
        rateLimitRejectionsToday: null,
      },
      { status: 503 }
    );
  }
}

// ============================================
// MAIN DEFI REQUEST HANDLER
// ============================================

async function handleDefiRequest(request: NextRequest): Promise<NextResponse> {
  const clientIP = getClientIP(request);

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const address = searchParams.get("address");
    const tokenAddress = searchParams.get("token");

    if (!action) {
      return NextResponse.json(
        { error: "Missing required parameter: action" },
        { status: 400 }
      );
    }

    if (!address || !isValidAddress(address)) {
      return NextResponse.json(
        { error: "Missing or invalid parameter: address (must be 0x... Ethereum address)" },
        { status: 400 }
      );
    }

    const actionConfig = VALID_ACTIONS[action];
    if (!actionConfig) {
      return NextResponse.json(
        { 
          error: "Invalid action", 
          validActions: Object.keys(VALID_ACTIONS) 
        },
        { status: 400 }
      );
    }

    // CACHE CHECK FIRST (before rate limiting) — skip for non-cacheable actions
    const isCacheable = actionConfig.cacheable !== false;
    const cacheKey = action === "token_price" 
      ? `defi:${action}:${(tokenAddress || address).toLowerCase()}`
      : action === "swap_quote"
      ? `defi:${action}:${address.toLowerCase()}:${searchParams.get("amount")}:${searchParams.get("token_in") || "eth"}:${searchParams.get("token_out") || "pulse"}`
      : `defi:${action}:${address.toLowerCase()}`;
    
    if (isCacheable) {
      const cached = await kv.get<Record<string, unknown>>(cacheKey);
      
      if (cached) {
        console.log(`[HeyElsa x402] Cache hit for ${action}:${address}`);
        await trackCacheHit();
        return NextResponse.json({
          ...cached,
          _cached: true,
          _cachedAt: new Date().toISOString(),
        });
      }
    }

    // RATE LIMIT CHECK (only for cache misses)
    const rateLimit = await checkRateLimit(clientIP);
    if (!rateLimit.allowed) {
      await trackRateLimitRejection();
      console.log(`[WARD] Rate limit exceeded for ${clientIP} (${rateLimit.limitType})`);
      return NextResponse.json(
        { 
          error: "Rate limit exceeded", 
          message: `Limit: ${rateLimit.limitType === "minute" ? RATE_LIMIT_PER_MINUTE + "/min" : RATE_LIMIT_PER_HOUR + "/hour"}. Please slow down.`,
          retryAfter: rateLimit.limitType === "minute" ? 60 : 3600
        },
        { 
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rateLimit.limitType === "minute" ? RATE_LIMIT_PER_MINUTE : RATE_LIMIT_PER_HOUR),
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(rateLimit.limitType === "minute" ? 60 : 3600),
          }
        }
      );
    }

    // BUDGET CHECK (only for cache misses)
    const budgetExceeded = await isBudgetExceeded();
    if (budgetExceeded) {
      const spend = await getDailySpend();
      logBudgetAlert(spend);
      return NextResponse.json(
        { 
          error: "Service temporarily unavailable", 
          message: "Daily spending limit reached. Please try again tomorrow.",
          budgetExceeded: true
        },
        { status: 503 }
      );
    }

    // Increment rate limit counter (cache miss + budget OK)
    await incrementRateLimit(clientIP);
    await trackCacheMiss();

    const requestBody: Record<string, unknown> = {};

    if (action === "token_price") {
      if (!tokenAddress || !isValidAddress(tokenAddress)) {
        return NextResponse.json(
          { error: "Missing or invalid parameter: token (token address required for token_price)" },
          { status: 400 }
        );
      }
      requestBody.token_address = tokenAddress;
      requestBody.chain = "base";
    } else if (action === "swap_quote" || action === "execute_swap") {
      const tokenIn = searchParams.get("token_in") || "0x0000000000000000000000000000000000000000"; // default: ETH
      const tokenOut = searchParams.get("token_out") || "0x21111B39A502335aC7e45c4574Dd083A69258b07"; // default: PULSE
      const amount = searchParams.get("amount");
      const slippage = searchParams.get("slippage") || "1"; // 1% default

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        return NextResponse.json(
          { error: "Missing or invalid parameter: amount (positive number required for swap)" },
          { status: 400 }
        );
      }

      requestBody.token_in = tokenIn;
      requestBody.token_out = tokenOut;
      requestBody.amount = amount;
      requestBody.slippage = slippage;
      requestBody.chain = "base";
      requestBody.wallet_address = address;
    } else if (action === "gas_prices") {
      requestBody.chain = "base";
    } else {
      requestBody.wallet_address = address;
    }

    console.log(`[HeyElsa x402] Fetching ${action} for ${address}`);
    
    const response = await fetchWithPayment(actionConfig.endpoint, requestBody);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[HeyElsa x402] API error: ${response.status}`, errorText);
      
      return NextResponse.json(
        { 
          error: "HeyElsa API error", 
          status: response.status,
          message: errorText 
        },
        { status: 503 }
      );
    }

    const data = await response.json();

    if (isCacheable) {
      await kv.set(cacheKey, data, { ex: CACHE_TTL_SECONDS });
      console.log(`[HeyElsa x402] Cached ${action} for ${address} (TTL: ${CACHE_TTL_SECONDS}s)`);
    }

    return NextResponse.json({
      ...data,
      _cached: false,
      _fetchedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[HeyElsa x402] Error:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    if (message.includes("HEYELSA_PAYMENT_KEY")) {
      return NextResponse.json(
        { error: "Server configuration error: Payment wallet not configured" },
        { status: 503 }
      );
    }

    if (message.includes("exceeds max allowed")) {
      return NextResponse.json(
        { error: "Payment rejected: Amount exceeds safety limit ($0.05 max)" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch DeFi data", message },
      { status: 503 }
    );
  }
}

// ============================================
// API ROUTE EXPORTS
// ============================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  if (!searchParams.has("action")) {
    return handleHealthCheck();
  }

  return handleDefiRequest(request);
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
