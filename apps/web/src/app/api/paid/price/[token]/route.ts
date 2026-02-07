import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { withPayment, PRICES } from "../../x402";
import {
  fetchWithPayment,
  isValidAddress,
  CACHE_TTL_SECONDS,
} from "../../../defi/route";

/**
 * Paid Token Price Endpoint
 * 
 * Price: $0.005 per call
 * 
 * Returns current price for a given token on Base.
 * Uses KV cache (60s TTL) to minimize redundant HeyElsa calls.
 * 
 * Path params:
 * - token: Token contract address (0x...)
 * 
 * Query params:
 * - chain: Optional chain identifier (defaults to "base")
 */

interface PriceData {
  token_address?: string;
  chain?: string;
  price_usd?: number;
  price_native?: number;
  last_updated?: string;
  [key: string]: unknown;
}

export const GET = withPayment<PriceData>(PRICES.price, async (request, payment) => {
  // Extract token from URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const token = pathParts[pathParts.length - 1];
  const chain = url.searchParams.get("chain") || "base";

  // Validate token address
  if (!token || !isValidAddress(token)) {
    return NextResponse.json(
      {
        error: "Missing or invalid token address in path (must be 0x... Ethereum address)",
      },
      { status: 400 }
    );
  }

  const normalizedToken = token.toLowerCase();
  const cacheKey = `paid:price:${normalizedToken}:${chain}`;

  try {
    // Check cache first
    const cached = await kv.get<PriceData>(cacheKey);
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
    console.log(`[Paid Price] Fetching price for ${token} on ${chain}, paid by ${payment.payer}`);
    
    const response = await fetchWithPayment("/api/get_token_price", {
      token_address: normalizedToken,
      chain,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Paid Price] HeyElsa error: ${response.status}`, errorText);
      return NextResponse.json(
        {
          error: "Failed to fetch token price",
          status: response.status,
          message: errorText,
        },
        { status: 503 }
      );
    }

    const data: PriceData = await response.json();

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
    console.error("[Paid Price] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Failed to fetch token price",
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
