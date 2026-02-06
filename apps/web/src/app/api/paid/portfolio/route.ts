import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { withPayment, PRICES } from "../x402";
import {
  fetchWithPayment,
  isValidAddress,
  CACHE_TTL_SECONDS,
} from "../../defi/route";

/**
 * Paid Portfolio Endpoint
 * 
 * Price: $0.02 per call
 * 
 * Returns portfolio data for a given wallet address.
 * Uses KV cache (60s TTL) to minimize redundant HeyElsa calls.
 * 
 * Query params:
 * - address: Ethereum address (0x...) to fetch portfolio for
 */

interface PortfolioData {
  wallet_address?: string;
  total_value_usd?: number;
  positions?: unknown[];
  tokens?: unknown[];
  [key: string]: unknown;
}

export const GET = withPayment<PortfolioData>(PRICES.portfolio, async (request, payment) => {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  // Validate address
  if (!address || !isValidAddress(address)) {
    return NextResponse.json(
      {
        error: "Missing or invalid parameter: address (must be 0x... Ethereum address)",
      },
      { status: 400 }
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
        },
      });
    }

    // Fetch from HeyElsa (internal hot wallet pays)
    console.log(`[Paid Portfolio] Fetching for ${address}, paid by ${payment.payer}`);
    
    const response = await fetchWithPayment("/api/get_portfolio", {
      wallet_address: normalizedAddress,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Paid Portfolio] HeyElsa error: ${response.status}`, errorText);
      return NextResponse.json(
        {
          error: "Failed to fetch portfolio data",
          status: response.status,
          message: errorText,
        },
        { status: 503 }
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
      { status: 500 }
    );
  }
});

// Support HEAD for health checks
export async function HEAD(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200 });
}
