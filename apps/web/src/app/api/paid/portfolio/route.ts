export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { withPaymentGate, PRICES } from "../x402";
import {
  fetchWithPayment,
  isValidAddress,
  CACHE_TTL_SECONDS,
} from "../../defi/route";

/**
 * Paid Portfolio Endpoint
 *
 * Price: $0.02 per call (USDC on Base)
 *
 * Returns real portfolio data from HeyElsa for a given wallet address.
 * Uses KV cache (60s TTL) to minimize redundant HeyElsa calls.
 *
 * Access modes:
 * - x402 payment via X-PAYMENT header
 * - API key bypass via X-API-KEY header (matches PAID_API_BYPASS_KEY env)
 *
 * Query params:
 * - address: Ethereum address (0x...) to fetch portfolio for
 */

interface PortfolioData {
  success?: boolean;
  wallet_address?: string;
  network?: string;
  portfolio?: {
    balances?: Array<{
      chain?: string;
      asset?: string;
      token_metadata?: {
        chain?: string;
        symbol?: string;
        address?: string;
        decimals?: number;
        price_usd?: number;
      };
      balance?: number;
      balance_usd?: number;
      logo_url?: string;
      is_trash?: boolean;
    }>;
    staking?: unknown[];
    yield?: {
      yield_positions?: unknown[];
      total_yield_value_usd?: number;
      active_positions?: number;
    };
    perpetuals?: unknown;
    limitOrders?: unknown[];
    points?: Record<string, unknown>;
    totalValueUSD?: string;
  };
  timestamp?: string;
  [key: string]: unknown;
}

export const GET = withPaymentGate<PortfolioData>(PRICES.portfolio, async (request, payment) => {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  // Validate address
  if (!address || !isValidAddress(address)) {
    return NextResponse.json(
      {
        error: "Missing or invalid parameter: address (must be 0x... Ethereum address)",
      },
      { status: 400 },
    );
  }

  const normalizedAddress = address.toLowerCase();
  const cacheKey = `paid:portfolio:${normalizedAddress}`;

  try {
    // Check cache first
    const cached = await kv.get<PortfolioData>(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        _cached: true,
        _cachedAt: new Date().toISOString(),
        _payment: {
          payer: payment.payer,
          amount: payment.amount,
          timestamp: payment.timestamp,
          method: payment.method,
        },
      });
    }

    // Fetch from HeyElsa (internal hot wallet pays via x402)
    console.log(
      `[Paid Portfolio] Fetching for ${address}, access by ${payment.payer} (${payment.method})`,
    );

    const response = await fetchWithPayment("/api/get_portfolio", {
      wallet_address: normalizedAddress,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Paid Portfolio] HeyElsa error: ${response.status}`, errorText);
      return NextResponse.json(
        {
          error: "Failed to fetch portfolio data from HeyElsa",
          status: response.status,
          message: errorText,
        },
        { status: 503 },
      );
    }

    const data: PortfolioData = await response.json();

    // Cache the result
    await kv.set(cacheKey, data, { ex: CACHE_TTL_SECONDS });

    return NextResponse.json({
      ...data,
      _cached: false,
      _fetchedAt: new Date().toISOString(),
      _payment: {
        payer: payment.payer,
        amount: payment.amount,
        timestamp: payment.timestamp,
        method: payment.method,
      },
    });
  } catch (error) {
    console.error("[Paid Portfolio] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch portfolio data",
        message,
      },
      { status: 500 },
    );
  }
});

// Support HEAD for health checks
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}
